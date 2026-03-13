---
config:
  layout: elk
  theme: redux
  look: classic
  themeVariables:
    edgeLabelBackground: '#fff'
    fontSize: 18px
---
erDiagram
    %% 用户实体（完整属性）
    USER {
        int id PK "用户唯一标识"
        string username UK "登录的名称"
        string email UK "邮箱"
        string password "加密后的密码"
        string avatar "用户头像地址"
        timestamp created_at "注册时间"
        timestamp updated_at "更新时间"
    }

    %% 直播间实体（完整属性）
    LIVEROOM {
        int id PK "直播间id"
        int user_id FK "关联主播id"
        string title "直播间标题"
        enum status "直播间状态（正在直播/已结束）"
        string stream_key "直播推流验证密钥"
        timestamp start_time "直播开始时间"
    }

    %% 弹幕实体（完整属性）
    DANMAKU {
        int id PK "评价唯一Id"
        int user_id FK "发送人id"
        int stream_id FK "所属直播间id"
        string content "经过筛查后的内容"
        timestamp created_at "创建时间"
    }

    %% 关注关系实体（完整属性）
    FOLLOW {
        int id PK "预约记录Id"
        int follower_id FK "发起关注的用户id"
        int following_id FK "被关注的用户id"
        timestamp created_at "创建时间"
        timestamp updated_at "更新时间"
    }

    %% 实体间关系定义
    USER ||--|| LIVEROOM : "拥有（Own）"
    USER ||--|{ DANMAKU : "发布（Publish）"
    LIVEROOM ||--|{ DANMAKU : "包含（Contain）"
    USER }|--|{ FOLLOW : "关注（Follow）"
    FOLLOW }|--|{ USER : "被关注（Followed）"