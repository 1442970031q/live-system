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
    USER ||--o{ VIOLATION_RECORD : "产生(Produces)"
    LIVEROOM ||--o{ VIOLATION_RECORD : "包含(Contains)"
    VIOLATION_RECORD ||--o{ AUDIT_LOG : "生成(Generates)"
    SENSITIVE_WORD ||--o{ AUDIT_LOG : "触发(Triggers)"

    USER {
        int id PK "用户唯一标识(核心业务实体引用)"
    }

    LIVEROOM {
        int id PK "直播间唯一标识(核心业务实体引用)"
    }

    VIOLATION_RECORD {
        int id PK "违规记录唯一Id"
        int user_id FK "关联主播id"
        int stream_id FK "所属直播间id"
        enum content_type "违规内容类型"
        string content "违规原文/音频转写文本"
        string matched_words "匹配到的敏感词列表"
        enum action "系统处置措施"
        timestamp created_at "违规发生时间"
    }

    SENSITIVE_WORD {
        int id PK "敏感词唯一Id"
        string word "敏感词内容"
        enum level "敏感词违规等级"
        enum source "敏感词来源"
        timestamp created_at "敏感词添加时间"
    }

    AUDIT_LOG {
        int id PK "日志唯一Id"
        enum operation_type "操作类型"
        int target_id "关联目标Id"
        string operator "操作者"
        string result "操作结果描述"
        timestamp created_at "操作执行时间"
    }