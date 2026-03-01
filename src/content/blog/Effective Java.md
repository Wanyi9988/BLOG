---
title: 'Effective Java'
description: 'Effective Java 学习记录'
category: '学习记录'
pubDate: 2026-03-01
---

> Effective Java edition3 提供了 90 条编写 Java 程序相关的建议。
>
> 作为 Java 开发工程师不知不觉已经接近 3 年了，但在工作中我仍偶尔对于程序的编写和系统的设计会产生模棱两可的不确定感。我不仅感到这种模糊会损伤我的工作产出，还怀疑这种不清晰会造成微妙的心理负担。我期望通过细致的学习，消除这种模糊感，达到极致的掌控。

## Item1

### Consider static factory methods instead of constructors

这是一条比较直观和好理解的建议：使用静态方法代替构造器来实例化对象。

好处可以总结为：

1. 静态方法有名字，且可以封装业务逻辑，控制创建流程；

**NO**：

```
public class User {

    private final String name;
    private final String address;
    private final String role;
    private final boolean enabled;

    public User(String name, String address, String role, boolean enabled) {
        this.name = name;
        this.address = address;
        this.role = role;
        this.enabled = enabled;
    }

}
```
```
User rose = new User("rose", "ROAD 5th", "USER", true);
User mike = new User("mike", null, "USER", false);
User admin = new User("admin01", null, "ADMIN", true);
```

**YES**：

```
public class User {
    ... ...

    private User(String name, String address, String role, boolean enabled) {
        this.name = name;
        this.address = address;
        this.role = role;
        this.enabled = enabled;
    }

    public static User register(String name, String address) {
        return new User(name, address, "USER", true);
    } 

    public static User disabled(String name) {
        return new User(name, null, "USER", false);
    }

    public static User admin(String name) {
        return new User(name, null, "ADMIN", true);
    }

}
```
```
User rose = User.register("rose", "ROAD 5th");
User mike = User.disabled("mike");
User admin = User.admin("admin01");
```

2. 静态方法可以实现实例控制，不需要每次都创建新的实例来返回，以实现享元和单例；
NO：
```
public class DataBaseConfig {

    private final String host;
    private final int port;
    private final String dataBase;

    public DataBaseConfig(String host, int port, String dataBase) {
        this.host = host;
        this.port = port;
        this.dataBase = dataBase;
    }
}
```
```
// 每次使用config都需要创建新对象
// config1 == config2 为 false
DataBaseConfig config1 = new DataBaseConfig("127.0.0.1", 3306, "order_data_base");
DataBaseConfig config2 = new DataBaseConfig("127.0.0.1", 3306, "order_data_base");
```

YES:
```
public class DataBaseConfig {

    private final String host;
    private final int port;
    private final String dataBase;

    private DataBaseConfig(String host, int port, String dataBase) {
        this.host = host;
        this.port = port;
        this.dataBase = dataBase;
    }

    private static final Map<String, DataBaseConfig> CACHE = new ConcurrentHashMap<>();

    public static DataBaseConfig of(String host, int port, String dataBase) {
        String key = host + ":" + port + "/" + dataBase;
        return CACHE.computeIfAbsent(key, k -> new DataBaseConfig(host, port, dataBase));
    }    
}
```
```
// config1 == config2 为 true
DataBaseConfig config1 = DataBaseConfig.of("127.0.0.1", 3306, "order_data_base");
DataBaseConfig config2 = DataBaseConfig.of("127.0.0.1", 3306, "order_data_base");
```

3. 静态方法可以返回子类实例，且不对外暴露子类实现。

NO：
```
public class Connection {

    private final String config;

    private Connection(String config) {
        this.config = config;
    }

    public static class LocalConnection extends Connection {

        public LocalConnection(String connection) {
            super(connection);
        }

    }

    public static class RemoteConnection extends Connection {

        public RemoteConnection(String connection) {
            super(connection);
        }

    }

}
```
```
LocalConnection localConnection = new LocalConnection("xx");
RemoteConnection remoteConnection = new RemoteConnection("xx");
```

YES：
```
public abstract class Connection {
    
    private String config;

    private Connection(String config) {
        this.config = config;
    }

    private static class LocalConnection extends Connection {

        private LocalConnection(String connection) {
            super(connection);
        }

    }

    private static class RemoteConnection extends Connection {

        private RemoteConnection(String connection) {
            super(connection);
        }

    }

    public static Connection of(String type, String config) {
        if ("local".equals(type)) {
            return new LocalConnection(config);
        } else if ("remote".equals(type)) {
            return new RemoteConnection(config);
        }
        throw new IllegalArgumentException("Unknown type");
    }
}
```
```
Connection localConnection = Connection.of("local", "xx");
Connection remoteConnection = Connection.of("remote", "xx");
```