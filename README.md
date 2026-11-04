# SpaceMate

**An interactive 2D/3D room-layout editor built with React, TypeScript, and Three.js.**

SpaceMate is an ISA401 Human–AI Interaction coursework prototype for arranging furniture, exploring floor plans, and testing spatial editing interactions. It includes an AI-assistant interface placeholder; AI-generated layout suggestions are not connected yet. The current application interface is in Chinese.

## Getting Started

### Requirements

- Node.js 22.12 or later in a compatible LTS release.
- npm.
- A desktop browser with WebGL support and hardware acceleration enabled.
- A mouse with left, right, and middle buttons for the full set of editing controls.

### Installation

```bash
git clone https://github.com/Jinnnhn/ISA401_Group1.git
cd ISA401_Group1
npm ci
npm run dev
```

Open **http://127.0.0.1:5178/**. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`. After installing dependencies, you can also double-click `启动初版.cmd` to start the editor.

### Available Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server on port 5178. |
| `npm run build` | Run TypeScript checks and produce a production build in `dist/`. |
| `npm test` | Run the layout, persistence, selection, and camera-interaction tests. |

## Technology Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Core rendering engine | Three.js 0.180 | WebGL rendering, cameras, lighting, furniture geometry, and scene management. |
| Frontend framework | React 19 | Toolbars, property panels, floor-plan controls, and the assistant interface. |
| Programming language | TypeScript 5.9 | Typed room, furniture, door, material, and interaction data. |
| Development and build tooling | Vite 7 | Local development, module loading, and production bundling. |
| Camera and input controls | Three.js `OrbitControls` and custom Pointer Events handlers | View rotation, panning, zooming, object dragging, and click-versus-drag handling. |
| Picking and selection | Three.js `Raycaster`, screen-space marquee selection, and dashed bounding boxes | Furniture, door, and window selection with visual feedback. |
| Application state | React state and refs | Shared floor-plan data, current selection, and independent undo/redo histories. |
| Persistence | Browser `localStorage` and JSON import/export | Save layouts locally and transfer individual floor plans between browsers. |
| Geometry validation | Custom TypeScript geometry functions | Rotated furniture footprints, wall-boundary constraints, overlap checks, and door-swing checks. |
| Models and materials | Local GLB assets, procedural Three.js meshes, and Canvas textures | Shared sofa/chair models in the editor and maps, shaped furniture, and selectable floor/wall finishes. See `public/models/ATTRIBUTION.md` for asset credits. |
| Interface icons | Lucide React | Consistent toolbar and panel icons. |
| Testing | Node.js test runner, `node:assert`, and `tsx` | Automated checks for geometry, state isolation, storage compatibility, and interaction rules. |

The current prototype runs entirely in the browser. It does not require a backend, database server, physics engine, or AI API key.

## Interface Layout

### Main Editing Canvas

- Fill the available editing viewport with the room-layout canvas.
- Switch between a **2D top-down view** and an interactive **3D view**.
- Display clear furniture, door, and window selection feedback, including outlines, bounding boxes, and dimensions where applicable.
- Provide **undo**, **redo**, and **reset view** controls.
- Keep the toolbar above the canvas as a floating interface.

### Furniture Properties

- Inspect the selected furniture and its basic dimensions.
- Change its position, orientation, and color.
- Replace, copy, delete, lock, or unlock furniture.
- Preserve the original position and orientation when replacing furniture; reject replacements that introduce overlaps, block doors, or exceed room boundaries.
- Clearly indicate whether furniture is locked.
- Support batch movement, deletion, and locking. Disable incompatible property actions when the current selection cannot perform them together.

### Floor-Plan and Room Management

- Manage floor plans from the top bar.
- Switch between the **Forest Apartment** (`林间公寓`) and **Sunny Two-Bedroom** (`晴空两居`) examples.
- Preserve independent furniture layouts, door states, materials, and in-session undo/redo histories for each floor plan.
- Preserve each room's layout when switching between rooms.
- Edit the current floor-plan name and basic room dimensions.
- Save both floor plans locally. JSON import/export and restoring an example affect only the current floor plan.

### Whole-House Mini Map

- Show a small **3D overview of the entire home** in the lower-left corner.
- Click the map to open an enlarged whole-house view.
- Click a room in the enlarged map to switch the main editor to that room.
- Support panning and zooming in the enlarged map.
- Show the main view's ground-plane coverage, clipped to the active room, as a dashed outline.
- Use the same floor-plan data as the main canvas so furniture, room dimensions, and materials update together.

### Floating Panels and Assistant Placeholder

- The furniture panel, whole-house preview, and space assistant each have a **`>` button** to collapse them and a control to reopen them.
- The **AI Suggestions** button opens the space assistant.
- The assistant floats above the canvas without reducing the canvas size. It has a maximum width of **680 px** and a maximum height of **220 px**.
- Drag the assistant's title bar to reposition it within the editing area.
- The assistant includes a request field, a scope selector, example prompts, and a **Generate Suggestions** button.
- **AI functionality is not implemented:** the button only displays a placeholder notice. It does not submit requests to an AI service or change the layout.

## Interaction Design

### Mouse Controls

| Action | Behavior |
| --- | --- |
| Left-click furniture | Select it and show its properties. Locked furniture can also be selected individually. |
| Left-drag already-selected furniture | Move it, or move the selected group while preserving relative positions. |
| Left-drag from empty space or unselected furniture | Draw a dashed selection box instead of immediately moving furniture. |
| Use the marquee tool | Start a selection box from any point on the canvas. |
| Shift + left-click | Add or remove furniture from the selection. |
| Right-click selected furniture | Remove that furniture from the selection; other selected furniture remain selected. |
| Right-drag in 3D | Orbit the room view and change its elevation angle. |
| Middle-drag | Pan the view horizontally and vertically. |
| Mouse wheel | Zoom in or out. |

A movement threshold distinguishes a click from a drag. **Furniture must be selected with a separate click before it can be dragged.** Locked furniture are excluded from marquee selection but remain individually clickable for inspection and unlocking.

### Object Feedback and Placement

- Highlight furniture on hover and show a **3D dashed bounding box** when selected.
- Show a dashed screen-space marquee, candidate count, and selection feedback while box-selecting.
- Support **10 cm grid snapping** and basic multi-object alignment along the Z centerline.
- Keep the full rotated furniture footprint inside the room's wall boundaries. Group movement stops at the wall without changing the spacing between selected objects.
- Apply wall-boundary validation to rotation, replacement, coordinate input, copying, and imported layouts as well.
- Show visual warnings when furniture overlap or occupy a door's opening area. These warnings currently allow further editing; wall-boundary violations are constrained.
- Keep locked furniture protected from movement, rotation, replacement, and deletion.

### Measurement

- Display the room's width and depth.
- Show furniture dimensions in the property panel and selection labels.
- Use the measurement tool to click two points on the ground plane and display their distance.

### Floor and Wall Materials

- Choose from **light oak, dark walnut, terrazzo, and matte tile** floor finishes.
- Choose from **warm white paint, sage green paint, microcement, and white brick** wall finishes.
- Apply finishes to the current room, with synchronized updates in the main view and whole-house map.
- Include material changes in undo/redo, local saves, and JSON import/export.

## Door Interaction

- Support selectable doors in living rooms and bedrooms.
- Inspect door properties and switch the door leaf between **open** and **closed** states.
- Configure **left or right hinges** and **inward or outward opening** independently.
- Show the door leaf and its opening arc in 2D.
- Show the door leaf's open or closed position in 3D.
- Include the complete opening area in furniture collision checks, even when the door is closed, and warn when furniture would block the door.

Hinge labels follow each wall's local coordinate direction. Door-opening checks use an approximately polygonal 90-degree swing sector rather than a physics simulation.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl + Z` | Undo. |
| `Ctrl + Shift + Z` / `Ctrl + Y` | Redo. |
| `Ctrl + S` | Save both floor plans locally. |
| `Ctrl + D` | Duplicate selected furniture. |
| `R` | Rotate selected furniture by 90 degrees. |
| `Delete` / `Backspace` | Delete selected, unlocked furniture. |
| `V` | Activate the selection tool. |
| `B` | Activate the marquee tool. |
| `M` | Activate the measurement tool. |
| `Esc` | Cancel an active drag, clear measurements and selection, or close a dialog. |

## Project Structure

```text
src/
  App.tsx             Application state, property panels, history, and persistence
  Scene.tsx           Three.js rendering, picking, dragging, measurement, and maps
  AssistantPanel.tsx  Floating assistant interface placeholder
  SurfacePanel.tsx    Room material selection interface
  model.ts            Data types, sample plans, geometry, and validation
  placement.ts        Drag previews, single-object yielding, and safe duplication
  architecture.ts     Room heights and wall openings
  furniture.ts        Shared GLB cache and procedural furniture models
  projects.ts         Independent floor plans and storage migration
  selection.ts        Selection-versus-movement gesture rules
  rightOrbit.ts       Right-click and right-drag handling
  materials.ts        Procedural floor and wall textures
  model.test.ts       Automated tests
  style.css           Interface styling and responsive layout
  main.tsx            React entry point
screenshots/          Prototype screenshots
```

## Current Scope and Limitations

- Floor plans currently consist of predefined rectangular rooms. Freehand wall drawing, automatic wall joining, and arbitrary room creation are not implemented.
- Sofa and chair models use local GLB assets; other furniture uses procedural geometry. Room dimensions can be entered in meters, but sample plans are illustrative and are not surveyed homes. The editor is not a construction or building-code validation tool.
- Window selection and dimension inspection are supported; window opening/closing is not implemented.
- Overlap detection uses 2D rotated footprints. It does not model full 3D collisions or physical movement.
- Marquee selection uses projected furniture center points. Multi-object rotation turns each object around its own center.
- Undo/redo histories are separate per floor plan during the current session and are not restored after a page reload.
- Layouts are persisted only when **Save Layout** or `Ctrl + S` is used. Saves stay in the current browser; there is no cloud account or synchronization.
- AI integration, automatic layout optimization, and formal user studies remain future work.

The latest automated suite contains **32 tests**. Earlier browser-check details are recorded in [the verification log](验收记录.md); they do not constitute formal user-study results or user acceptance.


## 主画布与全屋地图模型同步

主画布、左下角小地图及放大的全屋地图使用同一家具模型工厂与缓存的 GLB 资源。地图在模型加载完成后自行刷新，不再保留旧版方块沙发。地图关闭阴影并保留低矮剖切墙面以便导航，家具形状、纹理、朝向与位置保持一致。

主视图拖动家具时，以独立的临时布局更新地图中的模型位置；松手后提交共享布局，Esc 取消则地图恢复原位。预览不进入保存或撤销历史。旋转、替换、删除、材质和房间切换继续使用原有共享数据。


## 布局与交互优化

- 默认隐藏右侧属性和低高度窗口的小地图，AI 占位收为紧凑输入条。选择家具时打开属性；点击空白或 Esc 可收起。撤销重做合并到顶部，工具栏、地图、视图控制和助手采用独立停靠区域。
- 相机投影按未遮挡区域居中，“适配当前房间”依据实际可见面积取景。每个房间的编辑视角与室内预览视角分别记忆。
- 室内预览只读：隐藏编辑工具，阻止 Delete、R、复制、撤销等编辑快捷键。退出后恢复原编辑模式、选择、面板状态和视角。
- 选择工具直接拖家具、空白处框选；专用框选工具可从任意位置开始。单击和拖动以 5 px 阈值区分。锁定家具拖动不会误触框选。
- 让位采用确定性网格搜索和位置过渡，仅一件未锁定家具移动，无物理模拟或连锁推挤。多选不触发让位；一次撤销恢复被拖家具及让位家具。地图同步临时布局，Esc 一并恢复。
- 旋转、替换、坐标与尺寸输入不接受新增的家具重叠或挡门冲突。复制会寻找附近有效空位，找不到则保持原布局。已有存档中的冲突不会静默删除，仍可手动修正。
- Esc 优先处理拖动、视角手势、测量，再处理当前弹窗、室内预览、展开助手、工具模式，最后清除选择。数值输入中的 Esc 仅恢复当前字段。
- 非法数值保留输入并显示原因，不会静默恢复旧值。未保存改动在刷新或关闭时触发浏览器提醒；房间和户型切换仍保留会话数据，不反复询问。
- AI 仍是明确标注的未接入占位界面，按钮禁用；本次优化不包含模型服务。
