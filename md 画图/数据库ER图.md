---
config:
  layout: dagre
  theme: redux
  look: classic
  themeVariables:
    edgeLabelBackground: '#fff'
---
flowchart LR
    User["用户"] --- U1(["用户ID"]) & U2(["用户名"]) & U3(["电子邮箱"]) & U4(["加密密码"])
    Live["直播间"] --- L1(["直播ID"]) & L2(["直播标题"]) & L3(["状态标识"])
    Comment["弹幕评价"] --- C1(["评价ID"]) & C2(["评价内容"])
    User -- 1 --- Rel1{"拥有"} & Rel2{"发布"}
    Rel1 -- 1 --- Live
    Rel2 -- n --- Comment
    Live -- 1 --- Rel3{"包含"}
    Rel3 -- n --- Comment
    User -- n --- Rel4{"预约"}
    Rel4 -- m --- User