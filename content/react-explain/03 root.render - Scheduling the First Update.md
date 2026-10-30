---
description: 深入剖析 React 19 的 root.render 调度链路：优先级决议（requestUpdateLane）、更新对象构造与并发队列惰性入队、微任务批处理边界（ensureRootIsScheduled）以及调度器任务分发机制。
tags: [react, react-internals, root-render, scheduling]
aliases: [root.render, 03 · root.render 调度首次更新]
react-version: 19.3.1
created: 2026-10-25T11:52:02.360Z
---

# root.render —— 调度首次更新

> [!summary] 核心速览（TL;DR）
> `root.render(<App />)` 实际上并不执行真正的渲染。它只负责完成一系列登记工作：选定一个赛道（Lane，通常为 `DefaultLane`）；将待渲染元素包装进一个更新对象 `Update {payload: {element}}`；将该更新对象暂存至一个全局并发队列中；在 `FiberRoot` 上将该赛道标记为待处理（Pending）；并确保一个**微任务（Microtask）**已排入浏览器的执行队列。
> 在该微任务中，根节点调度器（Root Scheduler）会挑选出待处理的赛道；对于非同步赛道，它会向 Scheduler 调度器注册一个任务（`performWorkOnRootViaSchedulerTask`），并在随后的宏任务中执行。你的 `<App />` 组件函数，正是在该宏任务中首次被真正调用的。

## 全链路调用总览

```mermaid
sequenceDiagram
  autonumber
  participant U as your code
  participant DR as ReactDOMRoot.render
  participant RC as updateContainer / Impl
  participant Q as concurrentQueues
  participant WL as scheduleUpdateOnFiber
  participant RS as RootScheduler
  participant MT as microtask
  participant S as Scheduler (MessageChannel)
  U->>DR: root.render(<App/>)
  DR->>RC: updateContainer(children, root, null, null)
  RC->>RC: lane = requestUpdateLane(current) => DefaultLane
  RC->>RC: update = createUpdate(lane); update.payload = {element}
  RC->>Q: enqueueUpdate(rootFiber, update, lane)
  Q-->>RC: FiberRoot (walk .return to HostRoot)
  RC->>WL: scheduleUpdateOnFiber(root, rootFiber, lane)
  WL->>WL: markRootUpdated(root, lane) — pendingLanes |= lane
  WL->>RS: ensureRootIsScheduled(root)
  RS->>MT: scheduleImmediateRootScheduleTask() => queueMicrotask
  Note over U,MT: root.render returns — nothing rendered yet
  MT->>RS: processRootScheduleInMicrotask()
  RS->>RS: scheduleTaskForRootDuringMicrotask: getNextLanes => DefaultLane
  RS->>S: scheduleCallback(NormalPriority, performWorkOnRootViaSchedulerTask)
  S->>RS: (next macrotask) performWorkOnRootViaSchedulerTask(root)
  RS->>RS: performWorkOnRoot(root, lanes, forceSync) => Work Loop
```

## 1. `ReactDOMRoot.prototype.render`

```js
function (children) {
  const root = this._internalRoot;
  if (root === null) throw new Error('Cannot update an unmounted root.');
  // DEV: warn on a 2nd argument (callback or container)
  updateContainer(children, root, null, null);
}
```

[^render] `children` 可以是任何合法的 `ReactNodeList`：单个元素、字符串、数组或 `null`。调用 `root.render(null)` 是一种合法的清空整棵组件树而不卸载根节点的方法。对于通过 `createRoot` 创建的根节点，`parentComponent` 和 `callback` 参数始终为 `null`。

## 2. `updateContainer`：确定优先级赛道

```js
export function updateContainer(element, container, parentComponent, callback) {
  const current = container.current;          // the HostRoot fiber
  const lane = requestUpdateLane(current);
  updateContainerImpl(current, lane, element, container, parentComponent, callback);
  return lane;
}
```

[^updatecontainer] `requestUpdateLane` 是 React 中决定**每一次更新优先级**的唯一核心入口，无论是 `setState`、`dispatch` 还是 `root.render` 都必须经过它。其判定优先级赛道的逻辑按如下顺序逐层判定：[^requestupdatelane]

1. （仅限 Legacy 模式，在 React 19 中已被彻底编译剔除）非并发 Fiber → `SyncLane`。
2. **渲染阶段更新（Render-phase update）**（即当前处于 `RenderContext` 上下文中且已有正在进行的渲染赛道）→ 复用当前渲染的赛道。源码注释将这种情况明确标注为“未正式支持（not officially supported）”。
3. **处于 Transition 过渡更新中**（由 `startTransition` 开启，此时 `ReactSharedInternals.T !== null`）→ 调用 `requestTransitionLane(transition)`。在同一个事件中触发的所有 Transition 会共享同一条 Transition 赛道。
4. **其他常规情况** → `eventPriorityToLane(resolveUpdatePriority())`。

`resolveUpdatePriority` 是一个由宿主环境配置（Host Config）提供的函数。对于浏览器 DOM 宿主：[^resolvepriority]

```js
export function resolveUpdatePriority() {
  const updatePriority = ReactDOMSharedInternals.p;     // set by React's event wrappers, flushSync, ...
  if (updatePriority !== NoEventPriority) return updatePriority;
  const currentEvent = window.event;
  if (currentEvent === undefined) return DefaultEventPriority;
  return getEventPriority(currentEvent.type);           // 'click' -> Discrete, 'mousemove' -> Continuous
}
```

对于在模块顶层直接调用的 `root.render(<App />)`，此时没有任何 React 合成事件正在执行，且全局 `window.event` 也为 `undefined`。因此，其解析得到的结果是 `DefaultEventPriority`，而它对应的正是 `DefaultLane`（默认赛道）：在底层，事件优先级本质上就是穿了马甲的 Lane 赛道。[^eventpriorities]

> [!warning] 易错点：首次渲染所在的 Lane 赛道取决于你在*何处*调用它
> - **顶层脚本中直接调用** → `DefaultLane`。
> - **在原生 `click` 事件监听器内部调用**（即使该监听器并未通过 React 绑定）→ `window.event.type === 'click'` → `getEventPriority` 返回 `DiscreteEventPriority`（离散事件优先级）→ **`SyncLane`**（同步赛道）。[^geteventpriority]
> - **在 `startTransition(() => root.render(<App/>))` 内部调用** → 分配到 Transition 过渡赛道，此赛道支持可中断的时间切片（Time-sliced）。
> - **在 `flushSync(() => root.render(...))` 内部调用** → 内部将 `p` 强制设置为 Discrete 离散优先级 → 映射为 `SyncLane`，且在 `flushSync` 函数返回之前就会被同步冲刷完毕。[^flushsync]
>
> 值得注意的是，在 React 19 中，`DefaultLane` 与 `SyncLane` 在执行渲染时默认都不会向浏览器让出控制权（Yield，详见下文）。因此两者在表现上的核心差异在于**渲染何时启动**：对于 `SyncLane`，渲染会在当前微任务检查点（Microtask Checkpoint）末尾立即冲刷执行；而对于 `DefaultLane`，渲染则会在随后的 Scheduler 宏任务中执行。

## 3. `updateContainerImpl`：构造并入队更新对象

```js
// packages/react-reconciler/src/ReactFiberReconciler.js (simplified)
function updateContainerImpl(rootFiber, lane, element, container, parentComponent, callback) {
  const context = getContextForSubtree(parentComponent);  // emptyContextObject for createRoot
  if (container.context === null) container.context = context;
  else container.pendingContext = context;

  const update = createUpdate(lane);
  // Caution: React DevTools currently depends on this property being called "element".
  update.payload = {element};
  if (callback !== null) update.callback = callback;

  const root = enqueueUpdate(rootFiber, update, lane);
  if (root !== null) {
    startUpdateTimerByLane(lane, 'root.render()', null);
    scheduleUpdateOnFiber(root, rootFiber, lane);
    entangleTransitions(root, rootFiber, lane);
  }
}
```

[^updatecontainerimpl] `createUpdate` 会创建一个类组件队列风格的更新对象（Update Object）：`{lane, tag: UpdateState, payload: null, callback: null, next: null}`。[^createupdate] 这里的 `tag: UpdateState`（数值 0）代表“将 payload 浅合并（Shallow-merge）到上一次的状态中”，因此在后续处理该更新时，`HostRoot` 的 `state` 会变为 `{...prev, element: <App/>}`。[^updatestate] 如果有人试图在某个组件的渲染函数内部调用 `root.render`，React 会在这里触发 DEV 开发环境警告（"Render methods should be a pure function of props and state"）。

### `enqueueUpdate`：精心设计的惰性入队（Deliberately Lazy）

这里的 `enqueueUpdate`（针对类组件更新队列）首先会检查是否存在不安全的渲染阶段更新调用；随后它会将具体操作委托给 `enqueueConcurrentClassUpdate`。[^enqueueupdate] 值得注意的是，该函数并**没有**立即将更新对象链接到当前 Fiber 节点的更新队列（`fiber.updateQueue`）中，而是将一个四元组依次 push 到一个模块级的全局数组中：[^concurrentenqueue]

```js
// packages/react-reconciler/src/ReactFiberConcurrentUpdates.js (simplified)
function enqueueUpdate(fiber, queue, update, lane) {
  concurrentQueues[concurrentQueuesIndex++] = fiber;
  concurrentQueues[concurrentQueuesIndex++] = queue;
  concurrentQueues[concurrentQueuesIndex++] = update;
  concurrentQueues[concurrentQueuesIndex++] = lane;
  concurrentlyUpdatedLanes = mergeLanes(concurrentlyUpdatedLanes, lane);
  fiber.lanes = mergeLanes(fiber.lanes, lane);            // updated eagerly (bailout checks need it)
  if (fiber.alternate !== null) fiber.alternate.lanes = mergeLanes(fiber.alternate.lanes, lane);
}
```

随后，它会调用 `getRootForUpdatedFiber(fiber)`，沿着 `.return` 指针一路向上回溯到 `HostRoot` 并返回其 `stateNode`（即 `FiberRoot` 根节点）。对于根节点 Fiber 自身而言，这一步是瞬间完成的。[^getroot]

**为什么要延迟（惰性）链接队列？**
在并发渲染场景下，更新可能在*某个并发渲染正在进行时*到来（例如在渲染让出主线程的间隙，用户触发了一个新事件）。如果此时直接将新更新对象追加到 `queue.pending` 环形链表中，并立刻向上冒泡标记 `childLanes`，那么那个正在进行中的渲染就可能会在计算到一半时看到这个突发事件的部分更新，从而破坏渲染的一致性。
将更新先暂存到全局并发队列（Buffer）中，就能确保当前正在运行的渲染能够在一个干净、稳定的快照环境中执行。这个暂存队列最终由 `finishQueueingConcurrentUpdates()` 统一清空：它会将更新串联成环形链表 `pending`，然后调用 `markUpdateLaneFromFiberToRoot` 沿祖先链标记 `childLanes`。[^finishqueueing] 该冲刷操作在下一次渲染开始时的 `prepareFreshStack` 中运行，也会在每次渲染结束时调用。[^finishcallsite]

## 4. `scheduleUpdateOnFiber`：在 Fiber 上调度更新

```js
// packages/react-reconciler/src/ReactFiberWorkLoop.js (simplified)
export function scheduleUpdateOnFiber(root, fiber, lane) {
  // If the work loop is suspended on data, or a commit is suspended, restart from the top
  if ((root === workInProgressRoot && (reason === SuspendedOnData || reason === SuspendedOnAction))
      || root.cancelPendingCommit !== null) {
    prepareFreshStack(root, NoLanes);
    markRootSuspended(root, workInProgressRootRenderLanes, workInProgressDeferredLane, false);
  }
  markRootUpdated(root, lane);
  if ((executionContext & RenderContext) !== NoContext && root === workInProgressRoot) {
    // render-phase update: track it, warn in DEV
  } else {
    if (root === workInProgressRoot) { /* interleaved update bookkeeping */ }
    ensureRootIsScheduled(root);
    // legacy-only sync flush (dead code with disableLegacyMode)
  }
}
```

[^scheduleupdate] 其中调用的 `markRootUpdated` 逻辑非常简短，却至关重要：[^markrootupdated]

```js
root.pendingLanes |= updateLane;
if (updateLane !== IdleLane) {
  root.suspendedLanes = NoLanes;   // a new update might unblock suspended work: retry everything
  root.pingedLanes = NoLanes;
  root.warmLanes = NoLanes;
}
```

因此在 `root.render` 执行之后，`root.pendingLanes === DefaultLane`（二进制 `0b100000`）。这单个二进制位，就是 FiberRoot 记录“当前整棵树有待处理工作”的唯一凭证。

## 5. `ensureRootIsScheduled` 与微任务机制

这是 React 18.3+ 以及 React 19 全新重构的根节点调度器（Root Scheduler）。它彻底取代了旧版架构中“每次 `setState` 都立即调用 `Scheduler.scheduleCallback`”的设计。在当下架构中，`ensureRootIsScheduled`（确保根节点已安排调度）仅执行两项开销极低的轻量操作：[^ensureroot]

1. 将当前根节点追加到一个单向链表中（通过 `root.next` 串联的 `firstScheduledRoot` … `lastScheduledRoot`），若已在链表中则跳过。
2. 将标记置为 `mightHavePendingSyncWork = true`，并调用 `ensureScheduleIsScheduled`。后者通过 `scheduleImmediateRootScheduleTask`（由 `didScheduleMicrotask` 标志守卫），在当前事件循环的 tick 中**最多只排队一个微任务**。[^ensureschedule]

```js
function scheduleImmediateRootScheduleTask() {
  if (supportsMicrotasks) {
    scheduleMicrotask(() => {
      // Safari can run microtasks in the middle of render/commit (iframe append); bail to a macrotask then
      if ((getExecutionContext() & (RenderContext | CommitContext)) !== NoContext) {
        Scheduler_scheduleCallback(ImmediateSchedulerPriority, processRootScheduleInImmediateTask);
        return;
      }
      processRootScheduleInMicrotask();
    });
  } else {
    Scheduler_scheduleCallback(ImmediateSchedulerPriority, processRootScheduleInImmediateTask);
  }
}
```

[^immediatetask] 在 DOM 宿主环境下，`scheduleMicrotask` 在现代浏览器中直接采用原生 `queueMicrotask`，并向下降级兼容至 `Promise.resolve().then` 以及 `setTimeout`。[^schedulemicrotask]

**为什么选择微任务？**
微任务是天然的**批处理边界（Batching Boundary）**。在同一个同步 JavaScript 执行回合（Tick）中产生的所有更新——无论是同一个事件处理器中的十次 `setState`，还是先调用 `root.render` 紧接着又调用了一次 `setState`——都会在任何人决定“究竟该渲染什么”之前，统一合并进 `pendingLanes` 位掩码中。这就是真正的**“自动批处理（Automatic Batching）”**机制。正因为有了微任务这一边界，无论更新是发生在 `setTimeout` 定时器、Promise 回调还是原生 DOM 事件监听器中，自动批处理都能统一且稳定地运作，而无需再依赖 React 笨重地去嗅探自己是否“正处于某个合成事件中”。

### `processRootScheduleInMicrotask`：微任务中的根节点调度

[^processmicrotask] 该函数首先清除 `didScheduleMicrotask` 标记，然后遍历待调度根节点单向链表。对于链表中的每个根节点，它都会调用 `scheduleTaskForRootDuringMicrotask`；如果该调用返回 `NoLane`，则将该根节点从链表中摘除。源码注释特别强调：这个微任务是根节点离开调度链表的**唯一场所**，这种中心化收敛的设计从根本上杜绝了各种可重入（Reentrancy）导致的诡异 Bug。
最后，它会调用 `flushSyncWorkAcrossRoots_impl`，**当场在这个微任务内部，同步渲染并冲刷所有计算出的下一赛道包含 `SyncLane` 的根节点**。[^flushsyncacross]

### `scheduleTaskForRootDuringMicrotask`：同步赛道 vs 其他赛道

```js
// simplified
markStarvedLanesAsExpired(root, currentTime);
const nextLanes = getNextLanes(root, wipLanes, rootHasPendingCommit);
if (nextLanes === NoLanes || suspendedOnData || root.cancelPendingCommit !== null) {
  cancel existing; root.callbackNode = null; return NoLane;
}
if (includesSyncLane(nextLanes) && !checkIfRootIsPrerendering(root, nextLanes)) {
  // Synchronous work is always flushed at the end of the microtask, so we don't need an additional task.
  root.callbackPriority = SyncLane; root.callbackNode = null; return SyncLane;
}
const newCallbackPriority = getHighestPriorityLane(nextLanes);
if (newCallbackPriority === root.callbackPriority) return newCallbackPriority;  // reuse existing task
cancelCallback(root.callbackNode);
switch (lanesToEventPriority(nextLanes)) {
  case DiscreteEventPriority: case ContinuousEventPriority: schedulerPriorityLevel = UserBlockingPriority; break;
  case DefaultEventPriority: schedulerPriorityLevel = NormalPriority; break;
  case IdleEventPriority:    schedulerPriorityLevel = IdlePriority; break;
}
root.callbackNode = scheduleCallback(schedulerPriorityLevel, performWorkOnRootViaSchedulerTask.bind(null, root));
root.callbackPriority = newCallbackPriority;
```

[^scheduletask] 以我们的首次渲染为例：此时 `nextLanes = DefaultLane`，并不包含同步赛道，因此会向 Scheduler 注册一个 `NormalPriority`（普通优先级）任务。此时，`root.callbackNode` 保存了 Scheduler 返回的 `Task` 任务对象，且 `root.callbackPriority = DefaultLane`。

这里的“相同优先级 → 复用已有任务”判断，正是为什么连续调用十次相同优先级的 `setState` 不会创建出十个 Scheduler 任务的奥秘所在。而一旦有更高优先级的更新插入，它会果断取消现有任务（`cancelCallback`），并以更高的优先级重新向 Scheduler 预约任务。

## 6. Scheduler 调度任务：`performWorkOnRootViaSchedulerTask`

在随后的宏任务中（基于 Scheduler 的 `MessageChannel` 消息分发；详见 [[04 Lanes and the Scheduler|04 · Lanes 赛道模型与 Scheduler]]），Scheduler 会执行该绑定函数，并传入 `didTimeout` 标记：[^performviascheduler]

1. **检查异步提交状态**：如果当前仍有挂起的异步提交（如 View Transition），则立即放弃本次执行：清空 `callbackNode` 并返回 `null`。
2. **冲刷遗留副作用**：调用 `flushPendingEffectsDelayed()` 冲刷上一次提交残留的被动副作用（Passive Effects / `useEffect`）。如果在此过程中导致当前任务被取消，则直接退出。
3. **重新计算 `getNextLanes`**：源码注释对此给出了深刻解释：Scheduler 会将多个回调合并进同一个宏任务执行，而在宏任务内部连续执行回调的间隙并不会触发微任务，因此自从微任务阶段推导以来，完全可能有更新通过其他途径产生并累积，必须重新仲裁。
4. **进入工作循环**：调用 `performWorkOnRoot(root, lanes, forceSync = !disableSchedulerTimeoutInWorkLoop && didTimeout)`，正式开启 Fiber 工作循环（Work Loop）。
5. **处理任务延续（Continuation）**：在渲染阶段执行完毕后，再次调用 `scheduleTaskForRootDuringMicrotask`。如果 `root.callbackNode` 仍然指向当前同一个任务，则**返回一个延续函数**（`performWorkOnRootViaSchedulerTask.bind(null, root)`）。Scheduler 接收到延续函数后，会将同一个任务继续保留在最小堆中，并在向浏览器主线程让出控制权后再次调用它。

同步赛道走的则是另一条通道：由微任务冲刷逻辑触发的 `performSyncWorkOnRoot`，会直接以同步模式调用 `performWorkOnRoot(root, lanes, true)`。[^performsync]

### 本篇探索的终点：`performWorkOnRoot`

```js
const shouldTimeSlice =
  (!forceSync && !includesBlockingLane(lanes) && !includesExpiredLane(root, lanes))
  || checkIfRootIsPrerendering(root, lanes);
let exitStatus = shouldTimeSlice ? renderRootConcurrent(root, lanes) : renderRootSync(root, lanes, true);
```

[^performworkonroot] 这里的 `includesBlockingLane`（包含阻塞型赛道）涵盖了 Sync、InputContinuous、**Default** 以及 Gesture 赛道（及其水合变体）。[^blockinglane]
这意味着：首次挂载的渲染虽然是通过 Scheduler 宏任务派发的，但在底层真正执行时依然走的是 **`renderRootSync`**：即在 Fiber 节点之间完全不让出主线程，一鼓作气同步执行完毕。在 React 中，只有 Transition 过渡更新、Suspense 重试、Idle 空闲任务以及离屏渲染才会真正启用时间切片（Time-sliced）。至于工作循环本身的具体实现（`prepareFreshStack`、`workLoopSync`、`performUnitOfWork`），我们将在 [[06 The Work Loop - Render Phase|06 · 工作循环与 Render 阶段]] 中展开细致剖析。

> [!warning] 常见认知误区：“使用 `createRoot` 后，首次渲染就是并发/可中断的”
> `createRoot` 带来的其实是**异步化（Asynchronous）**特性（首次渲染被延迟推入随后的宏任务中执行，因此你的 `root.render` 调用会立即返回，不阻塞后续主线程代码）。但它**并不等于时间切片（Time-sliced）**！如果首次渲染的组件树非常庞大，其整个渲染过程依然会同步占用主线程直到完成。
> 如果希望让首次渲染具备让出主线程的能力，你必须显式将更新包装在 `startTransition` 中。但需注意：一旦使用了 Transition，后续到来的任何 Sync 或 Default 更新都会中断该过渡渲染并使其从头重试（详见 [[04 Lanes and the Scheduler|04 · Lanes 赛道模型与 Scheduler]]）。

## 冷启动执行时序线

| 时间节点 | 发生的关键动作 |
|---|---|
| 同步执行阶段（你的业务脚本中） | 执行 `createRoot` + `root.render`：更新对象入队，标记 `pendingLanes = DefaultLane`，将根节点调度微任务加入队列 |
| 业务脚本剩余代码 | 执行其他同步业务代码。若连续多次调用 `root.render`，后者的更新对象会直接追加：每次调用都会生成一个新的更新对象，并在按序处理时以最后一个 payload 为准 |
| 微任务检查点（Microtask Checkpoint） | 触发 `processRootScheduleInMicrotask` → 创建 Scheduler 的 `NormalPriority` 任务 → 调用 `port.postMessage` 预约宏任务 |
| 下一个宏任务（在此之前浏览器可能已先绘制了 HTML 骨架） | 执行 `performWorkOnRootViaSchedulerTask` → 进入 `renderRootSync` → 触发 Commit 提交（详见 [[09 Commit Phase - Mutation, Layout, Passive Effects|09 · Commit 阶段：突变、布局与被动副作用]]） |
| 后续动画帧 | 浏览器将已提交的真实 DOM 渲染像素绘制到屏幕上 |

正是因为真正的渲染启动于一个**宏任务**而非微任务中，浏览器在微任务结束与宏任务开始的间隙，**完全有机会先执行一次渲染流水线，将静态 HTML 骨架绘制上屏**。这也是为什么服务端渲染（SSR）生成的静态页面或单页应用预渲染的 HTML 外壳，能够在 React 完成客户端水合与提交前始终对用户可见的重要原因。

## React 编译器的影响

完全不受影响。React 编译器（React Compiler）根本不涉及 `react-dom`，也不会改动协调器的底层调度代码。无论是否使用编译器，`root.render` 都会在宿主根节点 `HostRoot` 上以完全相同的赛道精确生成一个更新对象。
编译器的威力是在稍后的渲染阶段内部才展现出来的（减少 JSX 与闭包的重新分配，并在状态更新时精准跳过未变子树的比对）。它丝毫不会改变底层*被调度的工作总量*。详情可参阅 [[15 Rendering With vs Without the Compiler|15 · 编译器的渲染性能对比]]。

## 总结与核心要点回顾

`root.render(<App />)` 本质上只是在记录一个渲染意图。它选定一个优先级赛道，将根元素包装为 `Update` 更新对象，将其暂存入全局并发队列，在源自 [[02 createRoot - FiberRoot and HostRoot|02 · createRoot 架构剖析]] 的 `FiberRoot` 上将该赛道标记为待处理，并向事件循环排队一个微任务。
该微任务构成了 React 自动化批处理的核心边界：在根节点调度器决定是立即冲刷同步工作还是向 Scheduler 预约任务之前，同一个同步执行回合中产生的所有更新都已整齐汇入 `pendingLanes`。首次渲染是异步的，但并不是时间切片的。下一篇中，我们将深入这套调度链路所倚赖的 Lanes 赛道模型与 Scheduler 核心机制。

### 核心知识点清单

- **`requestUpdateLane`**：决定每个更新归属赛道的总阀门；顶层调用的 `root.render` 默认被赋予 `DefaultLane`。
- **调用上下文至关重要**：在原生 `click` 监听器内部或 `flushSync` 中调用会获得 `SyncLane`；在 `startTransition` 中调用则获得 Transition 过渡赛道。
- **`updateContainerImpl`**：构造一个 `tag: UpdateState` 的更新对象，其 `{element}` 载荷将在后续处理中浅合并到 HostRoot 的状态中。
- **`concurrentQueues`**：故意延迟将更新链接到具体 Fiber 队列，避免并发渲染过程中发生交叉读写并看到不完整的突发更新。
- **`markRootUpdated`**：在 `root.pendingLanes` 中置位对应的 Lane，这是 FiberRoot 感知当前存在待处理工作的唯一标识。
- **`ensureRootIsScheduled`**：将根节点登记入队，并确保每个 tick 中最多只预约一个微任务，从而使跨上下文的自动批处理彻底普及化。
- **`scheduleTaskForRootDuringMicrotask`**：在微任务末尾同步冲刷所有同步赛道，相同优先级的任务直接复用，其余情况则向 Scheduler 预约新任务。
- **`performWorkOnRootViaSchedulerTask`**：在宏任务中重新推导 `getNextLanes`，调用 `performWorkOnRoot`，并在任务未完成时返回延续函数（Continuation）。
- **`includesBlockingLane`**：包含了 `DefaultLane`，因此首次渲染默认在 `renderRootSync` 中一气呵成；唯有使用 `startTransition` 才能获得让出主线程的时间切片能力。

← [[02 createRoot - FiberRoot and HostRoot|上一篇：02 · createRoot 架构剖析]] · [[00 React Internals Index|专栏目录]] · [[04 Lanes and the Scheduler|下一篇：04 · Lanes 赛道模型与 Scheduler]] →

[^render]: `ReactDOMRoot.prototype.render` — [packages/react-dom/src/client/ReactDOMRoot.js#L107-L136](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom/src/client/ReactDOMRoot.js#L107-L136)
[^updatecontainer]: `updateContainer` — [packages/react-reconciler/src/ReactFiberReconciler.js#L353-L370](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberReconciler.js#L353-L370)
[^requestupdatelane]: `requestUpdateLane` — [packages/react-reconciler/src/ReactFiberWorkLoop.js#L812-L868](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberWorkLoop.js#L812-L868)
[^resolvepriority]: `resolveUpdatePriority` — [packages/react-dom-bindings/src/client/ReactDOMUpdatePriority.js#L35-L45](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom-bindings/src/client/ReactDOMUpdatePriority.js#L35-L45)
[^eventpriorities]: 事件优先级在底层即为赛道（Event priorities are lanes）— [packages/react-reconciler/src/ReactEventPriorities.js#L22-L28](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactEventPriorities.js#L22-L28)
[^geteventpriority]: `getEventPriority` — [packages/react-dom-bindings/src/events/ReactDOMEventListener.js#L312-L416](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom-bindings/src/events/ReactDOMEventListener.js#L312-L416)
[^updatecontainerimpl]: `updateContainerImpl` — [packages/react-reconciler/src/ReactFiberReconciler.js#L393-L458](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberReconciler.js#L393-L458)
[^createupdate]: `createUpdate` — [packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L210-L221](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L210-L221)
[^updatestate]: `UpdateState` / `ReplaceState` — [packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L155-L156](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L155-L156)
[^enqueueupdate]: 类组件队列 `enqueueUpdate` — [packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L223-L274](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L223-L274)
[^concurrentenqueue]: 并发入队函数 `enqueueUpdate` / `enqueueConcurrentClassUpdate` — [packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L90-L163](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L90-L163)
[^getroot]: `getRootForUpdatedFiber` — [packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L252-L276](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L252-L276)
[^finishqueueing]: `finishQueueingConcurrentUpdates` — [packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L50-L84](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L50-L84)
[^finishcallsite]: `prepareFreshStack` 中的调用点 — [packages/react-reconciler/src/ReactFiberWorkLoop.js#L2284](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2284)（同步/并发渲染结束处的调用参见 L2764 与 L3048）
[^scheduleupdate]: `scheduleUpdateOnFiber` — [packages/react-reconciler/src/ReactFiberWorkLoop.js#L987-L1113](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberWorkLoop.js#L987-L1113)
[^markrootupdated]: `markRootUpdated` — [packages/react-reconciler/src/ReactFiberLane.js#L825-L849](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberLane.js#L825-L849)
[^ensureroot]: `ensureRootIsScheduled` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L116-L152](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L116-L152)
[^ensureschedule]: `ensureScheduleIsScheduled` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L154-L169](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L154-L169)
[^immediatetask]: `scheduleImmediateRootScheduleTask` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L650-L696](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L650-L696)
[^schedulemicrotask]: DOM 宿主环境的 `scheduleMicrotask` — [packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L871-L877](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L871-L877)
[^processmicrotask]: `processRootScheduleInMicrotask` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L259-L348](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L259-L348)
[^flushsyncacross]: `flushSyncWorkAcrossRoots_impl` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L185-L247](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L185-L247)
[^scheduletask]: `scheduleTaskForRootDuringMicrotask` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L384-L509](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L384-L509)
[^performviascheduler]: `performWorkOnRootViaSchedulerTask` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L513-L606](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L513-L606)
[^performsync]: `performSyncWorkOnRoot` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L608-L622](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L608-L622)
[^performworkonroot]: `performWorkOnRoot` 与 `shouldTimeSlice` — [packages/react-reconciler/src/ReactFiberWorkLoop.js#L1137-L1181](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1137-L1181)
[^blockinglane]: `includesBlockingLane` — [packages/react-reconciler/src/ReactFiberLane.js#L684-L694](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberLane.js#L684-L694)
[^flushsync]: `flushSync` 设置 `ReactDOMSharedInternals.p = DiscreteEventPriority` — [packages/react-dom/src/shared/ReactDOMFlushSync.js#L22-L35](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom/src/shared/ReactDOMFlushSync.js#L22-L35)
