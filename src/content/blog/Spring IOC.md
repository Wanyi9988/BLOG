---
title: 'Spring IOC'
description: 'Spring IOC 学习记录'
category: '学习记录'
pubDate: 2025-07-01
---

# Spring IOC

## 核心类

### BeanDefinition

Bean 可以被看作是 BeanDefinition 的实例。

#### AbstractBeanDefinition

```Java
public void validate() throws BeanDefinitionValidationException {
    // 工厂方法和方法重写会存在冲突
    if (hasMethodOverrides() && getFactoryMethodName() != null) {
        throw new BeanDefinitionValidationException(
                "Cannot combine factory method with container-generated method overrides: " +
				"the factory method must create the concrete bean instance."
		);
    }
    if (hasBeanClass()) {
        prepareMethodOverrides();
    }
}
```

### BeanFactory

#### DefaultListableBeanFactory

##### registerBeanDefinition

```Java
public void registerBeanDefinition(String beanName, BeanDefinition beanDefinition) {
    Assert.hasText(beanName, "Bean name must not be empty");
    Assert.notNull(beanDefinition, "BeanDefinition must not be null");
    
    if (beanDefinition instanceof AbstractBeanDefinition abd) {
        try {
            abd.validate();
        } catch (BeanDefinitionValidationException ex) {
            throw new BeanDefinitionStoreException(beanDefinition.getResourceDescription(), beanName, "Validation of bean definition failied", ex)
        }
    }
    
    BeanDefinition existingDefinition = this.beanDefinitionMap.get(beanName);
    if (existingDefinition != null) {
        if (!isBeanDefinitionOverridable(beanName)) {
            throw new BeanDefinitionOverrideException(beanName, beanDefinition, existingDefinition);
        } else {
            logBeanDefinitionOverriding(beanName, beanDefinition, existingDefinition);
        }
        this.beanDefinitionMap.put(beanName, beanDefinition);
    } else {
        if (isAlias(beanName)) {
            String aliasedName = canonicalName(beanName);
            if (!isBeanDefinitionOverridable(aliasedName)) {
                throw new ...;
            } else {
                removeAlias(beanName);
            }
        }
        
        if (hasBeanCreationStarted()) {
            synchronized (this.beanDefinitionMap) {
                this.beanDefinitionMap.put(beanName, beanDefinition);
                List<String> updatedDefinitions = new ArrayList<>(this.beanDefinitionNames.size() + 1);
                updatedDefinitions.addAll(this.beanDefinitionNames);
                updatedDefinitions.add(beanName);
                this.beanDefinitionNames = updatedDefinitions;
                removeManualSingletonName(beanName);
            }
        } else {
            this.beanDefinitionMap.put(beanName, beanDefinition);
            this.beanDefinitionNames.add(beanName);
            removeManualSingletonName(beanName);
        }
        this.frozenBeanDefinitionNames = null;
    }
    
    if (existingDefinition != null || containsSingleton(beanName)) {
        resetBeanDefinition(beanName);
    } else if (isConfigurationFrozen()) {
        clearByTypeCache();
    }
    
    if (beanDefinition.isPrimary()) {
        this.primaryBeanNames.add(beanName);
    }
}
```

##### removeBeanDefinition 

```Java
public void removeBeanDefinition(String beanName) throws NoSuchBeanDefinitionException {
    Assert.hasText(beanName, "beanName must not be empty");
    
    BeanDefinition bd = this.beanDefinitionMap.remove(beanName);
    if (bd == null) {
        throw new NoSuchBeanDefinitionException(beanName);
    }
    
    if (hasBeanCreationStarted()) {
        synchronized (this.beanDefinitionMap) {
            List<String> updatedDefinitions = new ArrayList<>(this.beanDefinitionNames);
            updatedDefinitions.remove(beanName);
            this.beanDefinitionNames = updatedDefinitions;
        }
    } else {
        this.beanDefinitionNames.remove(beanName);
    }
    
    this.frozenBeanDefinitionNames = null;
    resetBeanDefinition(beanName);
}
```

### ApplicationContext

> ApplicationContext 继承自 BeanFactory， 但是不应该被理解为 BeanFactory 的实现类，而是说其内部持有一个实例化的 BeanFactory。

#### ClassPathXmlApplicationContext

##### 构建方法

```Java
public ClassPathXmlApplicationContext(String[] configLocations, boolean refresh, @Nullable ApplicationContext parent) throws BeansException {
    super(parent);
    setConfigLocations(configLocations);
    if (refresh) {
        refresh();
    }   
}
```

##### refresh

ApplicationContext构建的核心方法，支持销毁后重建

```Java
public void refresh() throws BeansException, IllegalStateException {
    // 加锁，避免多线程同时进行构建和销毁（可重入锁）
    this.startupShutdownLock.lock();
    try {
        this.startupShutdownThread = Thread.currentThread();
        StartupStep contextRefresh = this.applicationStartup.start("spring.context.refresh");
        prepareRefresh();
        
        ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();
        prepareBeanFactory(beanFactory);
        
        try {
            // 允许子类对beanFactory进行后处理
            postProcessBeanFactory(beanFactory);
            StartupStep beanPostProcess = this.applicationStartup.start("spring.context.beans.post-process");
            // 调用在上下文中注册的所有beanFactoryPostProcessor实例，在Bean定义被读取之后，但在Bean实例化之前，对Bean定义进行修改或增强
            invokeBeanFactoryPostProcessors(beanFactory);
            // 注册Bean的后处理器
            registerBeanPostProcessors(beanFactory);
            beanPostProcess.end();
            
            // 初始化上下文的消息源
            initMessageSource();
            // 初始化应用事件广播器
            initApplicationEventMulticaster();
            // 允许子类在这里初始化一些特殊的Bean
            onRefresh();
            // 注册监听器Bean
            registerListeners();
            
            // 初始化所有除了懒加载以外的singleton
            finishBeanFactoryInitialization(beanFactory);
            
            // 完成refresh事件
            finishRefresh();
        } catch (RuntimeException | Error ex) {
            destroyBeans();
            cancelRefresh(ex);
            throw ex;
        } finally {
            contextRefresh.end();
        }
    } finally {
        this.startupShutdownThread = null;
        this.startupShutdownLock.unlock();
    }
}
```

##### prepareRefresh

为refresh的上下文做准备

```Java
protected void prepareRefresh() {
    this.startupDate = System.currentTimeMillis();
    this.closed.set(false);
    this.active.set(true);
    
    initPropertySources();
    
    getEnvironment().validateRequiredProperties();
    
    // earlyApplicationListeners: 容器初始化早期阶段注册的监听器
    // applicationListeners: 当前正在使用的监听器
    if (this.earlyApplicationListeners == null) {
        this.earlyApplicationListeners = new LinkedHashSet<>(this.applicationListeners);
    } else {
        this.applicationListners.clear();
        this.applicationListners.addAll(this.earlyApplicationListners);
    }
    this.earlyApplicationEvents = new LinkedHashSet<>();
}
```

##### obtainFreshBeanFactory

```Java
protected ConfigurableListableBeanFactory obtainFreshBeanFactory() {
    refreshBeanFactory();
    return getBeanFactory();
}
```

#### AbstractRefreshableApplicationContext

##### refreshBeanFactory

```Java
protected final void refreshBeanFactory() {
    if (hasBeanFactory()) {
        destroyBeans();
        closeBeanFactory();
    }
    try {
        DefaultListableBeanFactory beanFactory = createBeanFactory();
        beanFactory.setSerializationId(getId());
        beanFactory.setApplicationStartup(getApplicationStartup());
        customizeBeanFactory(beanFactory);
        loadBeanDefinitions(beanFactory);
        this.beanFactory = beanFactory;
    } catch (IOException ex) {
        throw new ApplicationContextException("I/O error parsing bean definition source for " + getDisplayName(), ex);
    }
}
```

##### customizeBeanFactory

配置是否允许override和循环引用

```Java
protected void customizeBeanFactory(DefaultListableBeanFactory beanFactory) {
    if (this.allowBeanDefinitionOverriding != null) {
        beanFactory,setAllowBeanDefinitionOverriding(this.allowBeanDefinitionOverriding);
    }
    if (this.allowCircularReferences != null) {
        beanFactory.setAllowCircularReferences(this.allowCircularReferences);
    }
}
```

#### AbstractXmlApplicationContext

##### loadBeanDefinitions

```Java
protected void loadBeanDefinitions(DefaultListableBeanFactory beanFactory) throws BeansException, IOException {
    XmlBeanDefinitionReader beanDefinitionReader = new XmlBeanDefinitionReader(beanFactory);
    
    beanDefinitionReader.setEnvironment(getEnvironment());
    beanDefinitionReader.setResourceLoader(this);
    beanDefinitionReader.setEntityResolver(new ResourceEntityResolver(this));
    
    initBeanDefinitionReader(beanDefinitionReader);
    loadBeanDefinitions(beanDefinitionReader);
}
```

##### loadBeanDefinitions

通过 configResources 和 configLocations 加载 beanDefinition

```Java
protected void loadBeanDefinitions(XmlBeanDefinitionReader reader) throws BeansException, IOException {
    Resource[] configResources = getConfigResources();
    if (configResources != null) {
        reader.loadBeanDefinitions(configResources);
    }
    String[] configLocations = getConfigLocations();
    if (configLocations != null) {
        reader.loadBeanDefinitions(configLocations);
    }
}
```

#### XmlBeanDefinitionReader

最终都是通过 Resource 加载

XmlBeanDefinitionReader#loadBeanDefinitions
XmlBeanDefinitionReader#doLoadBeanDefinitions
XmlBeanDefinitionReader#registerBeanDefinitions

##### registerBeanDefinitions

```Java
public int registerBeanDefinitions(Document doc, Resource resource) {
    BeanDefinitionDocumentReader documentReader = createBeanDefinitionDocumentReader();
    int countBefore = getRegistry().getBeanDefinitionCount();
    documentReader.registerBeanDefinitions(doc, createReaderContext(resource));
    return getRegistry().getBeanDefinitionCount() - countBefore;
}
```

DefaultBeanDefinitionDocumentReader#doRegisterBeanDefinitions
```Java
protected void doRegisterBeanDefinitions(Element root) {
    BeanDefinitionParserDelegate parent = this.delegate;
    BeanDefinitionParserDelegate current = createDelegate(getReaderContext(), root, parent);
    this.delegate = current;
    
    if (current.isDefaultNamespace(root)) {
        String profileSpec = root.getAttribute(PROFILE_ATTRIBUTE);
        if (StringUtils.hasText(profileSpec)) {
            String[] specifiedProfiles = StringUtils.tokenizeToStringArray(profileSpec, BeanDefinitionParserDelegate.MULTI_VALUE_ATTRIBUTE_DELIMITERS);
            if (!getReaderContext().getEnvironment().acceptsProfiles(specifiedProfiles)) {
                return;
            }
        }
    }
    
    preProcessXml(root);
    parseBeanDefinitions(root, current);
    postProcessXml(root);
    
    this.delegate = parent;
}
```

#### DefaultBeanDefinitionDocumentReader

##### parseBeanDefinitions

```Java
protected void parseBeanDefinitions(Element root, BeanDefinitionParserDelegate delegate) {
    if (delegate.isDefaultNamespace(root)) {
        NodeList nl = root.getChildNodes();
        for (int i = 0; i < nl.getLength(); i++) {
            Node node = nl.item(i);
            if (node instanceof Element ele) {
                if (delegate.isDefaultNamespace(ele)) {
                    parseDefaultElement(ele, delegate);
                } else {
                    delegate.parseCustomElement(ele);
                }
            }
        }
    } else {
        delegate.parseCustomElement(root);
    }
}
```

namespace:xmlns
defaultNamespace:http://www.springframework.org/schema/beans
defaultElement：import、alias、beans、bean

##### parseDefaultElement

```Java
private void parseDefaultElement(Element ele, BeanDefinitionParserDelegate delegate) {
    if (delegate.nodeNameEquals(ele, IMPORT_ELEMENT)) {
        importBeanDefinitionResource(ele);
    }
    else if (delegate.nodeNameEquals(ele, ALIAS_ELEMENT)) {
        processAliasRegistration(ele);
    }
    else if (delegate.nodeNameEquals(ele, BEAN_ELEMENT)) {
        processBeanDefinition(ele, delegate);
    }
    else if (delegate.nodeNameEquals(ele, NESTED_BEANS_ELEMENT)) {
        doRegisterBeanDefinitions(ele);
    }
}
```

##### processBeanDefinition
以 bean 解析为例：
```Java
protected void processBeanDefinition(Element ele, BeanDefinitionParserDelegate delegate) {
    BeanDefinitionHolder bdHolder = delegate.parseBeanDefinitionElement(ele);
    if (bdHolder != null) {
        bdHolder = delegate.decorateBeanDefinitionIfRequired(ele, bdHolder);
        try {
            BeanDefinitionReaderUtils.registerBeanDefinition(bdHolder, getReaderContext().getRegistry());
        } catch (BeanDefinitionStoreException ex) {
            getReaderContext().error("Failed to register bean Definition with name'" +
                    bdHolder.getBeanName() + "'", ele, ex);
        }
        getReaderContext().fireComponentRegistered(new BeanComponentDefinition(bdHolder));
    }
}
```

#### BeanDefinitionParserDelegate

##### parseBeanDefinitionElement

```Java
public @Nullable BeanDefinitionHolder parseBeanDefinitionElement(Element ele, @Nullable BeanDefinition containingBean) {
		String id = ele.getAttribute(ID_ATTRIBUTE);
		String name = ele.getAttribute(NAME_ATTRIBUTE);

		List<String> aliases = new ArrayList<>();
		if (StringUtils.hasLength(name)) {
			String[] nameArr = StringUtils.tokenizeToStringArray(name, MULTI_VALUE_ATTRIBUTE_DELIMITERS);
			aliases.addAll(Arrays.asList(nameArr));
		}

		String beanName = id;
		if (!StringUtils.hasText(beanName) && !aliases.isEmpty()) {
			beanName = aliases.remove(0);
		}

		if (containingBean == null) {
			checkNameUniqueness(beanName, aliases, ele);
		}

		AbstractBeanDefinition beanDefinition = parseBeanDefinitionElement(ele, beanName, containingBean);
		if(beanDefinition != null ){
			// ... ...
			// 省略后置beanName处理逻辑

			String[] aliasesArray = StringUtils.toStringArray(aliases);
			return new BeanDefinitionHolder(beanDefinition, beanName, aliasesArray);
		}

		return null;
	}
```

##### parseBeanDefinitionElement

```Java
public @Nullable AbstractBeanDefinition parseBeanDefinitionElement(Element ele, String beanName, @Nullable BeanDefinition containingBean) {
		this.parseState.push(new BeanEntry(beanName));

		String className = null;
		if (ele.hasAttribute(CLASS_ATTRIBUTE)) {
			className = ele.getAttribute(CLASS_ATTRIBUTE).trim();
		}

		String parent = null;
		if (ele.hasAttribute(PARENT_ATTRIBUTE)) {
			parent = ele.getAttribute(PARENT_ATTRIBUTE);
		}

		try {
			AbstractBeanDefinition bd = createBeanDefinition(beanName, parent);

			parseBeanDefinitionAttributes(ele, beanName, containingBean, bd);
			bd.setDescription(DomUtils.getChildElementValueByTagName(ele, DESCRIPTION_ELEMENT));

			parseMetaElements(ele, bd);
			parseLookupOverrideSubElements(ele, bd.getMethodOverrides());
			parseReplacedMethodSubElements(ele, bd.getMethodOverrides());

			parseConstructorArgElements(ele, bd);
			parsePropertyElements(ele, bd);
			parseQualifierElements(ele, bd);

			bd.setResource(this.readerContext.getResource());
			bd.setSource(extractSource(ele));

			return bd;
		} catch (ClassNotFoundException ex) {

		} catch (NoClassDefFoundError ex) {

		} catch (Throwable ex) {

		} finally {
			this.parseState.pop();
		}

		return null;
	}
```

#### BeanDefinitionReaderUtils

##### regsiterBeanDefinition

```Java
	public static void registerBeanDefinition(BeanDefinitionHolder definitionHolder, BeanDefinitionRegistry registry) throws BeanDefinitionStoreException {
		String beanName = definitionHolder.getBeanName();
		registry.registerBeanDefinition(beanName, definitionHolder.getBeanDefinition());

		String[] aliases = definitionHolder.getAliases();
		if (aliases != null) {
			for (String alias : aliases) {
				registry.registerBeanDefinition(alias, definitionHolder.getBeanDefinition());
			}
		}
	}
```

又回到上面的DefaultListableBeanFactory#registerBeanDefinition
回头介绍：

#### AbstractApplicationContext

##### prepareBeanFactory

```Java
protected void prepareBeanFactory(ConfigurableListableBeanFactory beanFactory) {
	beanFactory.setBeanClassLoader(getClassLoader());
	beanFactory.setBeanExpressionResolver(new StandardBeanExpressionResolver(beanFactory.getBeanClassLoader()));
	beanFactory.addBeanPostProcessor(new ApplicationContextAwareProcessor(this));
	
	beanFactory.ignoreDependencyInterface(EnvironmentAware.class);
	beanFactory.ignoreDependencyInterface(EmbeddedValueResolverAware.class);
	beanFactory.ignoreDependencyInterface(ResourceLoaderAware.class);
	beanFactory.ignoreDependencyInterface(ApplicationEventPublisherAware.class);
	beanFactory.ignoreDependencyInterface(MessageSourceAware.class);
	beanFactory.ignoreDependencyInterface(ApplicationContextAware.class);
	
	beanFactory.registerResolvableDependency(BeanFactory.class, beanFactory);
	beanFactory.registerResolvableDependency(ResourceLoader.class, this);
	beanFactory.registerResolvableDependency(ApplicationEventPublisher.class, this);
	beanFactory.registerResolvableDependency(ApplicationContext.class, this);
	
	// 省略LOAD_TIME bean特殊处理
	if (!beanFactory.containsLocalBean(ENVIRONMENT_BEAN_NAME)) {
	    beanFactory.registerSingleton(ENVIRONMENT_BEAN_NAME, getEnvironment());
	}
	if (!beanFactory.containsLocalBean(SYSTEM_PROPERTIES_BEAN_NAME)) {
        beanFactory.registerSingleton(SYSTEM_PROPERTIES_BEAN_NAME, getEnvironment().getSystemProperties());
    }
    if (!beanFactory.containsLocalBean(SYSTEM_ENVIRONMENT_BEAN_NAME)) {
        beanFactory.registerSingleton(SYSTEM_ENVIRONMENT_BEAN_NAME, getEnvironment().getSystemEnvironment());
    }
    if (!beanFactory.containsLocalBean(APPLICATION_STARTUP_BEAN_NAME)) {
        beanFactory.registerSingleton(APPLICATION_STARTUP_BEAN_NAME, getApplicationStartup());
    }
}
```

##### finishBeanFactoryInitialization
重点:
Spring会在这个阶段完成所有singleton(除懒加载外)的初始化
```Java
    protected void finishBeanFactoryInitialization(ConfigurableListableBeanFactory beanFactory) {
		// bootstrap executor
		if (beanFactory.containsBean(BOOTSTRAP_EXECUTOR_BEAN_NAME) &&
				beanFactory.isTypeMatch(BOOTSTRAP_EXECUTOR_BEAN_NAME, Executor.class)) {
			beanFactory.setBootstrapExecutor(beanFactory.getBean(BOOTSTRAP_EXECUTOR_BEAN_NAME, Executor.class));
		}

		// conversion service
		if (beanFactory.containsBean(CONVERSION_SERVICE_BEAN_NAME) &&
				beanFactory.isTypeMatch(CONVERSION_SERVICE_BEAN_NAME, ConversionService.class)) {
			beanFactory.setConversionService(beanFactory.getBean(CONVERSION_SERVICE_BEAN_NAME, ConversionService.class));
		}

		if (!beanFactory.hasEmbeddedValueResolver()) {
			beanFactory.addEmbeddedValueResolver(strVal -> getEnvironment().resolvePlaceholders(strVal));
		}

		String[] initializerNames = beanFactory.getBeanNamesForType(BeanFactoryInitializer.class, false, false);
		for (String initializerName : initializerNames) {
			beanFactory.getBean(initializerName, BeanFactoryInitializer.class).initialize(beanFactory);
		}

		// 省略LOAD_TIME相关逻辑
		// ... ...

		beanFactory.setTempClassLoader(null);

		beanFactory.freezeConfiguration();
        
        // 开始初始化
		beanFactory.preInstantiateSingletons();
	}
```

#### DefaultListableBeanFactory

##### preInstantiateSingletons

```Java
	public void preInstantiateSingletons() throws BeansException {
		List<String> beanNames = new ArrayList<String>(this.beanDefinitionNames);
		List<CompletableFuture<?>> futures = new ArrayList<>();

		this.preInstantiationPhase = true;
		this.preInstantiationThread.set(PreInstantiation.MAIN);

		try {
			for (String beanName : beanNames) {
				RootBeanDefinition mbd = getMergedLocalBeanDefinition(beanName);
				if (!mbd.isAbstract() && mbd.isSingleton()) {
					CompletableFuture<?> future = preInstantiateSingleton(beanName, mbd);
					if (future != null) {
						futures.add(future);
					}
				}
			}
		} finally {
			this.preInstantiationThread.remove();
			this.preInstantiationPhase = false;
		}

		if (!futures.isEmpty()) {
			try {
				CompletableFuture.allOf(futures.toArray(new CompletableFuture<?>[0])).join();
			} catch (CompletionException ex) {
				ReflectionUtils.rethrowRuntimeException(ex.getCause());
			}
		}

		for (String beanName : beanNames) {
			Object singletonInstance = getSingleton(beanName, false);
			if (singletonInstance instanceof SmartInitializingSingleton smartSingleton) {
				StartupStep smartInitialize = getApplicationStartup().start("spring.beans.smart-initialize")
						.tag("beanName", beanName);
				smartSingleton.afterSingletonsInstantiated();
				smartInitialize.end();
			}
		}
	}
```

##### preInstantiationSingleton

```Java
    private @Nullable CompletableFuture<?> preInstantiateSingleton(String beanName, RootBeanDefinition mbd) {
		// 是否启用后台初始化
		if (mbd.isBackgroundInit()) {
			Executor executor = getBootstrapExecutor();
			if (executor != null) {
				String[] dependsOn = mbd.getDependsOn();
				if (dependsOn != null) {
					for (String depend : dependsOn) {
						getBean(depend);
					}
				}
				CompletableFuture<?> future = CompletableFuture.runAsync(() -> instantiateSingletonInBackgroundThread(beanName), executor);
				addSingletonFactory(beanName, () -> {
					try {
						future.join();
					} catch (CompletionException ex) {
						ReflectionUtils.rethrowRuntimeException(ex.getCause());
					}
					return future;
				});
				return mbd.isLazyInit() ? null : future;
			}
		}

		if (!mbd.isLazyInit()) {
			try {
				instantiateSingleton(beanName);
			} catch (BeanCurrentlyInCreationException ex) {

			}
		}

		return null;
	}
```

##### instantiateSingleton
```Java
	private void instantiateSingleton(String beanName) {
		if (isFactoryBean(beanName)) {
			Object bean = getBean(FACTORY_BEAN_PREFIX + beanName);
			if (bean instanceof SmartFactoryBean<?> smartFactoryBean && smartFactoryBean.isEagerInit()) {
				getBean(beanName);
			}
		} else {
			getBean(beanName);
		}
	}
```

#### AbstractBeanFactory

AbstractBeanFactory#getBean
AbstractBeanFactory#doGetBean

##### doGetBean

```Java
	protected <T> T doGetBean(String name, @Nullable Class<T> requiredType, @Nullable Object @Nullable [] args, boolean typeCheckOnly) {
		String beanName = transformedBeanName(name);
		Object beanInstance;

		Object sharedInstance = getSingleton(beanName);
		if (sharedInstance != null && args == null) {
			beanInstance = getObjectForBeanInstance(sharedInstance, name, beanName, null);
		} else {
			// 避免循环依赖
			if (isPrototypeCurrentlyInCreation(beanName)) {
				throw new BeanCurrentlyInCreationException(beanName);
			}

			BeanFactory parentBeanFactory = getParentBeanFactory();
			// 通过parentBeanFactory创建bean
			if (parentBeanFactory != null && !containsBeanDefinition(beanName)) {
				String nameToLookup = originalBeanName(name);
				if (parentBeanFactory instanceof AbstractBeanFactory abf) {
					return abf.doGetBean(nameToLookup, requiredType, args, typeCheckOnly);
				} else if (args != null) {
					return (T) parentBeanFactory.getBean(nameToLookup, args);
				} else if (requiredType != null) {
					return parentBeanFactory.getBean(nameToLookup, requiredType);
				} else {
					return (T) parentBeanFactory.getBean(nameToLookup);
				}
			}

			if (!typeCheckOnly) {
				markBeanAsCreated(beanName);
			}

			StartupStep beanCreation = this.applicationStartup.start("spring.beans.instantiate").tag("beanName", name);
			try {
				if (requiredType != null) {
					beanCreation.tag("beanType", requiredType::toString);
				}
				RootBeanDefinition mbd = getMergedLocalBeanDefinition(beanName);
				checkMergedBeanDefinition(mbd, beanName, args);

				String[] dependsOn = mbd.getDependsOn();
				if (dependsOn != null) {
					for (String depend : dependsOn) {
						if (isDependent(beanName, depend)) {
							throw new BeanCreationException(mbd.getResourceDescription(), beanName,
									"Circular depends-on relationship between '" + beanName + "' and '" + depend + "'");
						}
						registerDependentBean(depend, beanName);
						try {
							getBean(depend);
						} catch (NoSuchBeanDefinitionException ex) {
							throw new BeanCreationException(mbd.getResourceDescription(), beanName,
									"'" + beanName + "' depends on missing bean '" + depend + "'", ex);
						} catch (BeanCreationException ex) {
							if (requiredType != null) {
								throw new BeanCreationException(mbd.getResourceDescription(), beanName,
										"Failed to initialize dependency '" + ex.getBeanName() + "' of " +
												requiredType.getSimpleName() + " bean '" + beanName + "': " +
												ex.getMessage(), ex);
							}
							throw ex;
						}
					}
				}

				if (mbd.isSingleton()) {
					sharedInstance = getSingleton(beanName, () -> {
						try {
							return createBean(beanName, mbd, args);
						} catch (BeansException ex) {
							destroySingleton(beanName);
							throw ex;
						}
					});
					beanInstance = getObjectForBeanInstance(sharedInstance, name, beanName, mbd);
				} else if (mbd.isPrototype()) {
					// protoType: 每次请求bean时，都会创建一个新的实例
					Object prototypeInstance;
					try {
						beforePrototypeCreation(beanName);
						prototypeInstance = createBean(beanName, mbd, args);
					} finally {
						afterPrototypeCreation(beanName);
					}
					beanInstance = getObjectForBeanInstance(prototypeInstance, name, beanName, mbd);
				} else {
					String scopeName = mbd.getScope();
					if (!StringUtils.hasLength(scopeName)) {
						throw new IllegalStateException("No scope name defined for bean '" + beanName + "'");
					}
					Scope scope = this.scopes.get(scopeName);
					if (scope == null) {
						throw new IllegalStateException("No Scope registered for scope name '" + scopeName + "'");
					}
					try {
						Object scopedInstance = scope.get(beanName, () -> {
							beforePrototypeCreation(beanName);
							try {
								return createBean(beanName, mbd, args);
							} finally {
								afterPrototypeCreation(beanName);
							}
						});
						beanInstance = getObjectForBeanInstance(scopedInstance, name, beanName, mbd);
					} catch (IllegalStateException ex) {
						throw new ScopeNotActiveException(beanName, scopeName, ex);
					}
				}
			} catch (BeansException ex) {
				beanCreation.tag("exception", ex.getClass().toString());
				beanCreation.tag("message", String.valueOf(ex.getMessage()));
				cleanupAfterBeanCreationFailure(beanName);
				throw ex;
			} finally {
				beanCreation.end();
				if (!isCacheBeanMetadata()) {
					clearMergedBeanDefinition(beanName);
				}
			}
		}
		return adaptBeanInstance(name, beanInstance, requiredType);
	}
```

#### AbstractAutowireCapableBeanFactory

##### createBean

```Java
protected Object createBean(String beanName, RootBeanDefinition mbd, @Nullable Object @Nullable [] args) 
		throws BeanCreationException {
	RootBeanDefinition mbdToUse = mbd;
	
	Class<?> resolvedClass = resolveBeanClass(mbd, beanName);
	if (resolvedClass != null && !mbd.hasBeanClass() && mbd.getBeanClassName() != null) {
	    mbdToUse = new RootBeanDefinition(mbd);
	    mbdToUse.setBeanClass(resolvedClass);
	    try {
	        mbdToUse.prepareMethodOverrides();
	    } catch (BeanDefinitionValidationException ex) {
	        throw new BeanDefinitionStoreException(mbdToUse.getResourceDescription(), beanName,
	                "validation of method overrides failed", ex);
	    }
	}
	
	try {
	    Object bean = resolveBeforeInstantiation(beanName, mbdToUse);
	    if (bean != null) {
	        return bean;
	    }
	} catch (Throwable ex) {
	    throw new BeanCreationException(mbdToUse.getResourceDescription(), beanName,
	            "BeanPostProcessor before instantiation of bean failed", ex);
	}
	
	try {
	    Object beanInstance = doCreateBean(beanName, mbdToUse, args);
	    return beanInstance;
	} catch (BeanCreationException | ImplicitlyAppearedSingletonException ex) {
	    throw ex;
	} catch (Throwable ex) {
	    throw new BeanCreationException(mbdToUse.getResourceDescription(), beanName,
	            "Unexpected exception during bean creation", ex);
	}
}
```

##### doCreateBean

```Java
protected Object doCreateBean(String beanName, RootBeanDefinition mbd, @Nullable Object @Nullable [] args) 
        throws BeanCreationException {
    BeanWrapper instanceWrapper = null;
    if (mbd.isSingleton()) {
        instanceWrapper = this.factoryBeanInstanceCache.remove(beanName);
    }
    if (instanceWrapper == null) {
        instanceWrapper = createBeanInstance(beanName, mbd, args);
    }
    Object bean = instanceWrapper.getWrappedInstance();
    Class<?> beanType = instanceWrapper.getWrappedClass();
    if (beanType != NullBean.class) {
        mbd.resolvedTargetType = beanType;
    }
    
    synchronized (mbd.postProcessingLock) {
        if (!mbd.postProcessed) {
            try {
                applyMergedBeanDefinitionPostProcessors(mbd, beanType, beanName);
            } catch (Throwable ex) {
                throw new BeanCreationException(mbd.getResourceDescription(), beanName,
                        "Post-processing of merged bean definition failed", ex);
            }
            mbd.markAsPostProcessed();
        }   
    }
    
    boolean earlySingletonExposure = mbd.isSingleton() && this.allowCircularReferences 
            && isSingletonCurrentlyInCreation(beanName);
    if (earlySingletonExposure) {
        addSingletonFactory(beanName, () -> getEarlyBeanReference(beanName, mbd, bean));
    }
    
    Object exposedObject = bean;
    try {
	    populateBean(beanName, mbd, instanceWrapper);
	    exposedObject = initializeBean(beanName, exposedObject, mbd);
	} catch (Throwable ex) {
	    if (ex instanceof BeanCreationException bce && beanName.equals((bce.getBeanName()))) {
            throw bce;
        } else {
            throw new BeanCreationException(mbd.getResourceDescription(), beanName, ex.getMessage(), ex);
        }
	}
	
	// 处理早期暴露的单例引用
	if (earlySingletonExposure) {
        Object earlySingletonReference = getSingleton(beanName, false);
        if (earlySingletonReference != null) {
            if (exposedObject == bean) {
                exposedObject = earlySingletonReference;
            } else if (!this.allowRawInjectionDespiteWrapping && hasDependentBean(beanName)) {
                String[] dependentBeans = getDependentBeans(beanName);
                Set<String> actualDependentBeans = CollectionUtils.newLinkedHashSet(dependentBeans.length);
                for (String dependentBean : dependentBeans) {
                    // 排除仅用于类型检查而创建的bean
                    if (!removeSingletonIfCreatedForTypeCheckOnly(dependentBean)) {
                        actualDependentBeans.add(dependentBean);
                    }
                }
                if (!actualDependentBeans.isEmpty()) {
                    throw new BeanCurrentlyInCreationException(beanName, "...");
                }
            }
        }
    }
    
    try {
	    registerDisposableBeanIfNecessary(beanName, bean, mbd);
	} catch (BeanDefinitionValidationException ex) {
	    throw new BeanCreationException(mbd.getResourceDescription(), beanName, "...");
	}
	
	return exposedObject;
}
```

##### createBeanInstance

```Java
protected BeanWrapper createBeanInstance(String beanName, RootBeanDefinition mbd, @Nullable Object @Nullable [] args) {
    Class<?> beanClass = resolveBeanClass(mbd, beanName);
    
    if (beanClass != null && !Modifier.isPublic(beanClass.getModifiers()) && !mbd.isNonPublicAccessAllowed()) {
        throw new BeanCreationException(mbd.getResourceDescription(), beanName, "");
    }
    
    // 使用instanceSupplier创建
    if (args == null) {
        Supplier<?> instanceSupplier = mbd.getInstanceSupplier();
        if (instanceSupplier != null) {
            return obtainFromSupplier(instanceSupplier, beanName, mbd);
        }
    }
    
    // 使用工厂方法创建
    if (mbd.getFactoryMethodName() != null) {
        return instantiateUsingFactoryMethod(beanName, mbd, args);
    }
    
    // 快速重新创建相同的bean
    // 是否已经解析过构造函数或工厂方法
    boolean resolved = false;
    // 是否需要自动装配构造函数参数
    boolean autowireNecessary = false;
    if (args == null) {
        synchronized (mbd.constructorArgumentLock) {
            if (mbd.resolvedConstructorOrFactoryMethod != null) {
                resolved = true;
                autowireNecessary = mbd.constructorArgumentsResolved;
            }
        }
    }
    if (resolved) {
        if (autowireNecessary) {
            return autowireConstructor(beanName, mbd, null, null);
        } else {
            return instantiateBean(beanName, mbd);
        }
    }
    
    // 选取候选构造函数列表
    Constructor<?> [] ctors = determineConstructorsFromBeanPostProcessors(beanClass, beanName);
    // 检查是否应该使用构造函数注入
    if (ctors != null || mbd.getResolvedAutowireMode() == AUTOWIRE_CONSTRUCTOR ||
            mbd.hasConstructorArgumentValues() || !ObjectUtils.isEmpty(args)) {
        return autowireConstructor(beanName, mbd, ctors, args);
    }
    
    // 使用首选构造函数
    ctors = mbd.getPreferredConstructors();
    if (ctors != null) {
        return autowireConstructor(beanName, mbd, ctors, null);
    }
    
    // 使用无参构造函数实例化
    return instantiateBean(beanName, mbd);
}
```


AbstractAutowireCapableBeanFactory#instantiateBean:使用无参构造函数
```Java
protected BeanWrapper instantiateBean(String beanName, RootBeanDefinition mbd) {
    try {
        Object beanInstance = getInstantiationStrategy().instantiate(mbd, beanName, this);
        BeanWrapper bw = new BeanWrapperImpl(beanInstance);
        initBeanWrapper(bw);
        return bw;
    } catch (Throwable ex) {
        throw new BeanCreationException(mbd.getResourceDescription(), beanName, 
                ex.getMessage(), ex);
    }
}
```

#### SimpleInstantiationStrategy

InstantiationStrategy#instantiate
SimpleInstantiationStrategy#instantiate

##### instantiate

```Java
	public Object instantiate(RootBeanDefinition bd, String beanName, BeanFactory owner) {
		// 没有方法覆盖，使用默认构造函数实例化
		if (!bd.hasMethodOverrides()) {
			Constructor<?> constructorToUse;
			synchronized (bd.constructorArgumentLock) {
				constructorToUse = (Constructor<?>) bd.resolvedConstructorOrFactoryMethod;
				if (constructorToUse == null) {
					Class<?> clazz = bd.getBeanClass();
					if (clazz.isInterface()) {
						throw new BeanInstantiationException(clazz, "...");
					}
					try {
						constructorToUse = clazz.getDeclaredConstructor();
						bd.resolvedConstructorOrFactoryMethod = constructorToUse;
					} catch (Throwable ex) {
						throw new BeanInstantiationException(clazz, "...");
					}
				}
			}
			return BeanUtils.instantiateClass(constructorToUse);
		} else {
			// 生成CGLIB子类实现方法注入
			return instantiateWithMethodInjection(bd, beanName, owner);
		}
	}
```

#### BeanUtils
##### instantiateClass
通过反射机制实例化一个对象
```Java
	public static <T> T instantiateClass(Constructor<T> ctor, @Nullable Object... args) {
		Assert.notNull(ctor, "...");

		try {
			ReflectionUtils.makeAccessible(ctor);
			if (KotlinDetector.isKotlinType(ctor.getDeclaringClass())) {
				return KotlinDelegate.instantiateClass(ctor, args);
			} else {
				int parameterCount = ctor.getParameterCount();
				Assert.isTrue(args.length <= parameterCount, "Can't specify more arguments than constructor parameters");
				if (parameterCount == 0) {
					return ctor.newInstance();
				}
				Class<?>[] parameterTypes = ctor.getParameterTypes();
				@Nullable Object[] argsWithDefaultValues = new Object[args.length];
				for (int i = 0; i < args.length; i++) {
					if (args[i] == null) {
						Class<?> parameterType = parameterTypes[i];
						argsWithDefaultValues[i] = (parameterType.isPrimitive() ? DEFAULT_TYPE_VALUES.get(parameterType) : null);
					} else {
						argsWithDefaultValues[i] = args[i];
					}
				}
				return ctor.newInstance(argsWithDefaultValues);
			}
		} catch (InstantiationException ex) {
			throw new BeanInstantiationException(ctor, "...", ex);
		} catch (IllegalAccessException ex) {
			throw new BeanInstantiationException(ctor, "...", ex);
		} catch (IllegalArgumentException ex) {
			throw new BeanInstantiationException(ctor, "...", ex);
		} catch (InvocationTargetException ex) {
			throw new BeanInstantiationException(ctor, "...", ex);
		}
	}
```
bean实例化完成

#### AbstractAutowireCapableBeanFactory
##### populateBean
填充bean的属性值
```Java
protected void populateBean(String beanName, RootBeanDefinition mbd, @Nullable BeanWrapper bw) {
    if (bw == null) {
        if (mbd.hasPropertyValues()) {
            throw new BeanCreationException(mbd.getResourceDescription(), beanName, "...");
        } else {
            return;
        }
    }
    
    // record类型
    if (bw.getWrappedClass().isRecord()) {
        if (mbd.hasPropertyValues()) {
            throw new BeanCreationException(mbd.getResourceDescription(), beanName, "...");
        } else {
            return;
        }
    }
    
    // isSynthetic：是否是合成bean
    // 对非合成的bean执行后续的bean后置处理器操作
    if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
        for (InstantiationAwareBeanPostProcessor bp : getBeanPostProcessorCache().instantiationAware) {
            if (!bp.postProcessAfterInstantiation(bw.getWrappedInstance(), beanName)) {
                continue;
            }
        }
    }
    
    PropertyValues pvs = mbd.hasPropertyValues() ? mbd.getPropertyValues() : null;
    
    int resolvedAutowireMode = mbd.getResolvedAutowireMode();
    if (resolvedAutowireMode == AUTOWIRE_BY_NAME || resolvedAutowireMode == AUTOWIRE_BY_TYPE) {
        MutablePropertyValues newPvs = new MutablePropertyValues(pvs);
        if (resolvedAutowireMode == AUTOWIRE_BY_NAME) {
            autowireByName(beanName, mbd, bw, newPvs);
        }
        if (resolvedAutowireMode == AUTOWIRE_BY_TYPE) {
            autowireByType(beanName, mbd, bw, newPvs);
        }
        pvs = newPvs;
    }
    
    if (hasInstantiationAwareBeanPostProcessors()) {
        if (pvs == null) {
            pvs = mbd.getPropertyValues();
        }
        for (InstantiationAwareBeanPostProcessor bp : getBeanPostProcessorCache().instantiationAware) {
            PropertyValues pvsToUse = bp.postProcessProperties(pvs, bw.getWrappedInstance(), beanName);
            if (pvsToUse == null) {
                return;
            }
            pvs = pvsToUse;
        }
    }
    
    boolean needsDepCheck = mbd.getDependencyCheck() != AbstractBeanDefinition.DEPENDENCY_CHECK_NONE;
    if (needsDepCheck) {
        PropertyDescriptor[] filteredPds = filterPropertyDescriptorsForDependencyCheck(bw, mbd.allowCaching);
        checkDependencies(beanName, mbd, filteredPds, pvs);
    }
    
    if (pvs != null) {
        applyPropertyValues(beanName, mbd, bw, pvs);
    }
}
```

##### initializeBean
初始化bean

```Java
	protected Object initializeBean(String beanName, Object bean, @Nullable RootBeanDefinition mbd) {
		invokeAwareMethods(beanName, bean);

		Object wrappedBean = bean;
		if (mbd == null || !mbd.isSynthetic()) {
			wrappedBean = applyBeanPostProcessorsBeforeInitialization(wrappedBean, beanName);
		}

		try {
			invokeInitMethods(beanName, wrappedBean, mbd);
		} catch (Throwable ex) {
			throw new BeanCreationException();
		}
		if (mbd == null || !mbd.isSynthetic()) {
			wrappedBean = applyBeanPostProcessorsAfterInitialization(wrappedBean, beanName);
		}

		return wrappedBean;
	}
```