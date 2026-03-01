---
title: 'Spring AOP'
description: 'Spring AOP 学习记录'
category: '学习记录'
pubDate: 2025-05-01
---

# Spring AOP

Spring AOP（Aspect-Oriented Programming）是Spring框架的一部分，用于实现面向切面编程。它允许开发者分离横切关注点（cross-cutting concerns），比如日志记录、事务管理、安全检查等，从而提高代码的可维护性和重用性。

AOP 是 IOC 的一个扩展功能，是 IOC 流程中新增的一个扩展点，

Spring AOP的原理：动态代理。实例化的时候生成代理类，替代真实类对外提供服务。

## 1. 核心组件

### 1.1 @Aspect
#### 作用
@Aspect的主要作用是标记一个类为一个切面（Aspect），表明该类包含了一些切面逻辑（如通知、切入点等）。Spring 会自动检测带有 @Aspect 注解的类，并为其创建代理对象。代理对象会在适当的时候调用切面中的通知方法。Spring 使用动态代理（JDK 动态代理或 CGLIB）来实现这一过程。

#### 源码

```java
@Retention(RetentionPolicy.RUNTIME)
@Target({ELementType.TYPE})
public @interface Aspect {
    String value() default "";
}
```

#### 切面通知类型
```Java
前置通知：@Before
后置通知：@After
返回通知：@AfterReturning
抛出通知：@AfterThrowing
环绕通知：@Around
```

## 2. 切面实现
Spring AOP 通过一系列机制自动识别这些被@Aspect标识的切面类，并为其创建代理对象，从而应用相应的通知（Advice）逻辑。

### 2.1 组件扫描

#### @ComponentScan

##### 源码
```Java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
@Documented
@Repeatable(ComponentScan.class)
public @interface ComponentScan {
}
```

##### 字段含义
basePackages、value: 扫描的基础包  
nameGenerator: 自定义 Bean 名称生成器  
scopeResolver: Bean 的作用域  
lazyInit: 是否懒加载  

#### ClassPathBeanDefinitionScanner

##### 核心方法

**scan**
```Java
public int scan(String... basePackages) {
    int beanCountAtScanStart = this.registry.getBeanDefinitionCount();
    
    doScan(basePackages);
    
    if (this.includeAnnotationConfig) {
        AnnotationConfigUtils.registerAnnotationConfigProcessors(this.registry);
    }
    
    return (this.registry.getBeanDefinitionCount() - beanCountAtScanStart);
}
```

**doScan**
```Java
protected Set<BeanDefinitionHolder> doScan(String... basePackages) {
    Assert.notEmpty(basePackages, "At least one base package must be specified");
    
    Set<BeanDefinitionHolder> beanDefinitions = new LinkedHashSet<>();
    for (String basePackage : basePackages) {
        Set<BeanDefinition> candidates = findCandidateComponents(basePackage);
        for (BeanDefinition candidate : candidates) {
            // 作用域
            ScopeMetadata scopeMetadata = this.scopeMetadataResolver.resolveScopeMetadata(candidate);
            candidate.setScope(scopeMetadata.getScopeName());
            
            // bean名称
            String beanName = this.beanNameGenerator.generateBeanName(candidate, this.registry);
            
            if (candidate instanceof AbstractBeanDefinition abstractBeanDefinition) {
                postProcessBeanDefinition(abstractBeanDefinition, beanName);
            }
            if (candidate instanceof AnnotatedBeanDefinition annotatedBeanDefinition) {
                AnnotationConfigUtils.processCommonDefinitionAnnotations(annotatedBeanDefinition);
            }
            
            if (checkCandidate(beanName, candidate)) {
                BeanDefinitionHolder definitionHolder = new BeanDefinitionHolder(candidate, beanName);
                // 应用代理模式
                definitionHolder = AnnotationConfigUtils.applyScopedProxyMode(scopeMetadata, definitionHolder, this.registry);
                beanDefinitions.add(definitionHolder);
                registerBeanDefinition(definitionHolder, this.registry);
            }
        }
    }
    return beanDefinitions;
}
```

**findCandidateComponents**
```Java
public Set<BeanDefinition> findCandidateComponents(String basePackage) {
    if (this.componentsIndex != null && indexSupportsIncludeFilters()) {
        return addCandidateComponentsFromIndex(this.componentsIndex, basePackage);
    } else {
        return scanCandidateComponents(basePackage);
    }
}
```

**scanCandidateComponents**
```Java
private Set<BeanDefinition> scanCandidateComponents(String basePackage) {
    Set<BeanDefinition> candidates = new LinkedHashSet<>();
    try {
        String packageSearchPath = ResourcePatternResolver.CLASSPATH_ALL_URL_PREFIX +
                resolveBasePackage(basePackage) + '/' + this.resourcePattern;
        Resource[] resources = getResourcePatternResolver().getResources(packageSearchPath);
        
        for (Resource resource : resources) {
            String fileName = resource.getFilename();
            if (fileName != null && fileName.contains(ClassUtils.CGLIB_CLASS_SEPERATOR)) {
                // 忽略CGLIB生成的类文件
                continue;
            }
            try {
                MetadataReader metaDataReader = getMetaDataReaderFactory().getMetaDataReader(resource);
                if (isCandidateComponent(metaDataReader)) {
                    ScannedGenericBeanDefinition sbd = new ScannedGenericBeanDefinition(metaDataReader);
                    sbd.setSource(resource);
                    if (isCandidateComponent(sbd)) {
                        candidates.add(sbd);
                    }
                }
            } catch (...) {
                ...
            }
        }
    } catch (IOException ex) {
        // ... ...
    }
    return candidates;
}
```

### 2.2 创建代理

#### 核心类
AbstractAutoProxyCreator  
DefaultAopProxyFactory

#### AbstractAutoProxyCreator
实现了接口 BeanPostProcessor

##### 核心方法
**postProcessBeforeInstantiation**：在目标对象实例化**之前**创建代理对象

```Java
public @Nullable Object postProcessBeforeInstantiation(Class<?> beanClass, String beanName) {
    Object cacheKey = getCacheKey(beanClass, beanName);
    
    // 判断是否需要跳过代理创建
    if (!StringUtils.hasLength(beanName) || !this.targetSourcedBeans.contains(beanName)) {
        if (this.advisedBeans.containsKey(cacheKey)) {
            return null;
        }
        // 如果 beanClass 是基础设施类或应该跳过代理创建，将其标记为非代理对象
        if (isInfrastructureClass(beanClass) || shouldSkip(beanClass, beanName)) {
            this.advisedBeans.put(cacheKey, Boolean.FALSE);
        }
    }
    
    TargetSource targetSource = getCustomTargetSource(beanClass, beanName);
    if (targetSource != null) {
        if (StringUtils.hasLength(beanName)) {
            this.targetSourcedBeans.add(beanName);
        }
        Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(beanClass, beanName, targetSource);
        Object proxy = createProxy(beanClass, beanName, specificInterceptors, targetSource);
        this.proxyTypes.put(cacheKey, proxy.getClass());
        return proxy;
    }
    return null;
}
```

**buildProxy** : 创建代理对象的具体实现

```Java
private Object buildProxy(Class<?> beanClass, @Nullable String beanName, 
        Object @Nullable [] specificInterceptors, TargetSource targetSource, boolean classOnly) {
    // 暴露目标类信息
    if (this.beanFactory instanceof ConfigurableListableBeanFactory clbf) {
        AutoProxyUtils.exposeTargetClass(clbf, beanName, beanClass);
    }
    
    // 初始化代理工厂
    ProxyFactory proxyFactory = new ProxyFactory();
    proxyFactory.copyFrom(this);
    
    // 判断是否使用 CGLIB 动态代理，返回true，表示使用CGLIB
    if (proxyFactory.isProxyTargetClass()) {
        // 显式处理JDK代理对象 或 lambda表达式，保持兼容
        if(Proxy.isProxyClass(beanClass) || ClassUtils.isLambdaClass(beanClass)) {
            for (Class<?> ifc : beanClass.getInterfaces()) {
                proxyFactory.addInterface(ifc);
            }
        }
    } else {
        // 没有强制使用 CGLIB 代理标志，应用默认检查
        // 判断是否应该使用 CGLIB 代理
        if (shouldProxyTargetClass(beanClass, beanName)) {
            proxyFactory.setProxyTargetClass(true);
        } else {
            // 评估代理接口
            evaluateProxyInterfaces(beanClass, proxyFactory);
        }
    }
    
    Advisor[] advisors = buildAdvisors(beanName, specificInterceptors);
    proxyFactory.addAdvisors(advisors);
    proxyFactory.setTargetSource(targetSource);
    customizeProxyFactory(proxyFactory);
    
    proxyFactory.setFrozen(this.freezeProxy);
    if (advisorsPreFiltered()) {
        proxyFactory.setPreFiltered(true);
    }
    
    ClassLoader classLoader = getProxyClassLoader();
    if (classLoader instanceof SmartClassLoader smartClassLoader && classLoader != beanClass.getClassLoader()) {
        classLoader = smartClassLoader.getOriginalClassLoader();
    }
    return (classOnly ? proxyFactory.getProxyClass(classLoader) : proxyFactory.getProxy(classLoader));
}
```

> 代理模式的选择
> JDK 动态代理：需要目标对象至少实现一个接口。
> CGLIB 代理：如果目标对象没有实现接口，则使用 CGLIB 生成子类代理。

**postProcessAfterInitiation**：在目标对象实例化**之后**创建代理对象

```Java
public @Nullable Object postProcessAfterInitiation(@Nullable Object bean, String beanName) {
    if (bean != null) {
        Object cacheKey = getCacheKey(bean.getClass(), beanName);
        /** 
         * 如果 earlyBeanReferences 中存储的引用已经被更新或替换
         * 说明 bean 可能已经经历了某种形式的变化或初始化。
         * 需要重新评估是否需要为 bean 创建代理，以确保代理的正确性和一致性。
         */
        if (this.earlyBeanReference.remove(cacheKey) != bean) {
            return wrapIfNecessary(bean, beanName,  cacheKey);
        }
    }
    return bean;
}
```
> earlyBeanReferences：用来存储早期已经被初始化，但还未完全装配完毕的bean引用，可用于解决循环依赖问题。

**wrapIfNecessary**：给需要的类创建代理

```Java
protected Object wrapIfNecessary(Object bean, String beanName, Object cacheKey) {
    if (StringUtils.hasLength(beanName) && this.targetSourcedBeans.contains(beanName)) {
        return bean;
    }
    if (Boolean.FALSE.equals(this.advisedBeans.get(cacheKey))) {
        return bean;
    }
    if (isInfrastructureClass(bean.getClass()) || shouldSkip(bean.getClass(), beanName)) {
        this.advisedBeans.put(cacheKey, Boolean.FALSE);
    }
    
    Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(bean.getClass(), beanName, null);
    if (specificInterceptors != DO_NOT_PROXY) {
        this.advisedBeans.put(cacheKey, Boolean.TRUE);
        Object proxy = createProxy(
                bean.getClass(), beanName, specificInterceptors, new SingletonTargetSource(bean));
        this.proxyTypes.put(cacheKey, proxy.getClass());
        return proxy;
    }
    
    this.advisedBeans.put(cacheKey, Boolean.FALSE);
    return bean;
}
```

> targetSourcedBeans：允许开发者明确指定哪些bean需要特殊的代理处理

#### DefaultAopProxyFactory

**createAopProxy**

```Java
public AopProxy createAopProxy(AdvisedSupport config) throws AopConfigException {
    if (config.isOptimize() || config.isProxyTargetClass() || !config.hasUserSuppliedInterfaces()) {
        // 使用Cglib代理模式
        Class<?> targetClass = config.getTargetClass();
        if (targetClass == null && config.getProxiedInterfaces().length == 0) {
            throw new AopConfigException("TargetSource cannot determine target class: " +
			        "Either an interface or a target is required for proxy creation.");
        }
        if (targetClass == null || targetClass.isInterface() ||
                Proxy.isProxyClass(targetClass) || ClassUtils.isLambdaClass(targetClass)) {
            return new JdkDynamicAopProxy(config);           
        }
        return new ObjenesisCglibAopProxy(config);
    } else {
        // 使用JDK动态代理
        return new JdkDynamicAopProxy(config);
    }
}
```

### 2.3 切面执行

#### 核心类
DynamicAdvisedInterceptor
ReflectiveMethodInvocation

#### DynamicAdvisedInterceptor

##### 核心方法
**intercept**
```Java
public @Nullable Object intercept(Object proxy, Method method, Object[] args, MethodProxy methodProxy) throws Throwable {
    Object oldProxy = null;
    boolean setProxyContext = false;
    Object target = null;
    TargetSource targetSource = this.advised.getTargetSource();
    try {
        if (this.advised.exposeProxy) {
            // 设置当前代理到上下文
            oldProxy = AopContext.setCurrentProxy(proxy);
            setProxyContext = true;
        }
        
        // 获取目标对象
        target = targetSource.getTarget();
        Class<?> targetClass = target != null ? target.getClass() : null;
        
        // 获取拦截器和动态拦截advice链
        List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);
        Object retVal;
        
        if (chain.isEmpty()) {
            // 直接调用目标
            @Nullable Object[] argsToUse = AopProxyUtils.adaptArgumentsIfNecessary(method, args);
            retVal = AopUtils.invokeJoinpointUsingReflection(target, method, argsToUse);
        } else {
            retVal = new ReflectiveMethodInvocation(proxy, target, method, args, targetClass, chain).proceed();
        }
        return processReturnType(proxy, target, method, args, retVal);
    } finally {
        // 释放目标资源
        if (target != null && !targetSource.isStatic()) {
            targetSource.releaseTarget(target);
        }
        // 恢复旧的代理引用
        if (setProxyContext) {
            AopContext.setCurrentProxy(oldProxy);
        }
    }
}
```

#### ReflectiveMethodInvocation

##### 核心方法

**proceed**

```Java
public @Nullable Object proceed() throws Throwable {
    // 判断是否已经到达最后一个拦截器，如果是的话，调用实际的目标方法，即切入点方法
    if (this.currentInterceptorIndex == this.interceptorsAndDynamicMethodMatchers.size() -1) {
        return invokeJoinpoint();
    }
    
    Object interceptorOrInterceptionAdvice = 
            this.interceptorsAndDynamicMethodMatchers.get(++this.currentInterceptorIndex);
    if (interceptorOrInterceptionAdvice instanceof InterceptorAndDynamicMethodMatcher dm) {
        Class<?> targetClass = (this.targetClass != null ? this.targetClass : this.method.getDeclaringClass());
        if (dm.matcher().matches(this.method, targetClass, this.arguments)) {
            return dm.interceptor().invoke(this);
        } else {
            return proceed();
        }
    } else {
        return ((MethodInterceptor) interceptorOrInterceptionAdvice).invoke(this);
    }     
}
```

