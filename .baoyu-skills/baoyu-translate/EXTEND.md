target_language: zh-CN
default_mode: refined
audience: technical
style: technical
chunk_threshold: 4000
chunk_max_words: 5000

# React 原理全站专业术语对照表 (React Internals Glossary)

glossary:

- from: "reconciliation"
  to: "协调（Reconciliation）"
  note: "React 官方中文文档译法，初次出现注英文"
- from: "render"
  to: "渲染（Render）"
  note: "指执行组件函数生成描述，非屏幕绘制"
- from: "commit"
  to: "提交（Commit）"
  note: "将变更应用到 DOM 的阶段"
- from: "paint"
  to: "绘制（Paint）"
  note: "浏览器渲染引擎绘制像素"
- from: "fiber"
  to: "Fiber"
  note: "专有名词，保留不翻"
- from: "workLoop"
  to: "workLoop"
  note: "源码方法名，保留不翻"
- from: "beginWork"
  to: "beginWork"
  note: "源码函数名，保留不翻"
- from: "completeWork"
  to: "completeWork"
  note: "源码函数名，保留不翻"
- from: "batching"
  to: "批处理（Batching）"
- from: "bailout"
  to: "跳过渲染（Bailout）"
- from: "lane"
  to: "Lane（赛道/优先级）"
- from: "fine-grained reactivity"
  to: "细粒度响应式"
- from: "dispatcher"
  to: "Dispatcher（分发器）"
- from: "host root"
  to: "HostRoot（宿主根节点）"
- from: "fiber root"
  to: "FiberRoot"
- from: "passive effects"
  to: "被动副作用（Passive Effects / useEffect）"
- from: "layout effects"
  to: "布局副作用（Layout Effects / useLayoutEffect）"
- from: "declarative"
  to: "声明式"
- from: "imperative"
  to: "命令式"
