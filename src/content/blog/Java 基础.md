---
title: 'Java 基础'
description: 'Java 基础学习记录'
category: '学习记录'
pubDate: 2024-03-01
---

## 函数式接口

- Supplier<T>

```
T get()
() -> new Object()
```


- Function<T, R>

```
R apply(T t)
t -> t.toString()
```

- Consumer<T>

```
void accept(T t)
t -> System.out.print(t)
```

- Predicate<T>

```
boolean test(T t)
t -> t > 0
```