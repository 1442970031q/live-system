---
config:
  layout: elk
  theme: redux
  look: classic
  themeVariables:
    edgeLabelBackground: '#fff'
    fontSize: 18px
---
flowchart TD
 subgraph Client["客户端层"]
        A["客户端请求"]
  end
 subgraph D_sub["Upstream 组策略"]
        D1["负载均衡算法"]
        D2["健康检查"]
        D3["服务器组配置"]
  end
 subgraph Nginx["Nginx 负载均衡层"]
        B["Nginx Frontend<br>监听端口"]
        C{"路由逻辑<br>匹配 Location"}
        D["Upstream Module<br>负载均衡核心"]
        D_sub
  end
 subgraph Backend["上游服务器群组"]
        E["后端服务器 1<br>Web/App Server"]
        F["后端服务器 2<br>Web/App Server"]
        G["后端服务器 N..."]
  end
    B --> C & A
    C -- proxy_pass --> D
    D --> D_sub & B
    A --> B
    D -- 分发请求 --> E & F & G
    E -- 返回响应 --> D
    F -- 返回响应 --> D
    G -- 返回响应 --> D
    style D_sub fill:transparent
    style Backend stroke:#000000,fill:transparent
    style Nginx stroke:#000000,fill:transparent
    style Client fill:transparent
