const names: Readonly<Record<string, string>> = {
  '林间公寓': 'Forest Apartment', '晴空两居': 'Sunny Two-Bedroom',
  '客厅': 'Living room', '卧室': 'Bedroom', '书房': 'Study', '主卧': 'Main bedroom', '次卧': 'Second bedroom', '横厅': 'Living room',
  '皮木框架沙发': 'Leather and wood sofa', '椭圆茶几': 'Oval coffee table', '织物软包双人床': 'Upholstered double bed',
  '原木书桌': 'Wooden desk', '曲面织物单椅': 'Curved upholstered chair', '收纳边柜': 'Storage sideboard', '绿植': 'Plant',
  '拼花木地板': 'Parquet', '浅橡木': 'Light oak', '深胡桃木': 'Dark walnut', '水磨石': 'Terrazzo', '哑光瓷砖': 'Matte tile',
  '藏蓝枝叶壁纸': 'Navy botanical wallpaper', '暖白漆': 'Warm white paint', '鼠尾草绿': 'Sage green', '微水泥': 'Microcement', '白色砖墙': 'White brick',
  '家具': 'Furniture', '房门': 'Door', '窗户': 'Window',
};

const directions: Readonly<Record<string, string>> = {
  '东': 'east', '西': 'west', '南': 'south', '北': 'north', '东南': 'southeast', '西南': 'southwest', '东北': 'northeast', '西北': 'northwest',
};
const direction = (value: string) => directions[value] ?? value;
const distance = (value: string) => value.replace(/(-?\d+(?:\.\d+)?)\s*(平方米|毫米|厘米|公分|米)(?=$|[\s、，）])/gu,
  (_, number: string, unit: string) => `${number} ${unit === '平方米' ? 'm²' : unit === '米' ? 'm' : unit === '毫米' ? 'mm' : 'cm'}`);
const countItems = (count: string) => `${count} ${count === '1' ? 'item' : 'items'}`;
const countDoors = (count: string) => `${count} ${count === '1' ? 'door' : 'doors'}`;
const access = (kind:string) => kind==='床侧进出'?'bedside access':'cabinet access';

function name(value: string): string {
  if (Object.hasOwn(names, value)) return names[value];
  const numbered = /^(.*) (\d+)$/u.exec(value);
  if (numbered && Object.hasOwn(names, numbered[1])) return `${names[numbered[1]]} ${numbered[2]}`;
  const door = /^([东西南北])墙房门(?: (\d+))?$/u.exec(value);
  if (door) return `${direction(door[1])} wall door${door[2] ? ' ' + door[2] : ''}`;
  const wall = /^([东西南北])墙(窗边|窗口一侧|内侧|边)?$/u.exec(value);
  if (wall) return wall[2] === '窗边' || wall[2] === '窗口一侧'
    ? `the window on the ${direction(wall[1])} wall` : `the ${direction(wall[1])} wall`;
  const doors = /^(\d+) 扇房门$/u.exec(value);
  return doors ? countDoors(doors[1]) : value;
}

const list = (value: string) => value.split('、').map(name).join(', ');

const phrases: Readonly<Record<string, string>> = {
  '兼顾家具使用、取放和进出通行': 'Balance furniture use, storage access, and circulation',
  '当前位置通过墙内边界、家具重叠和门扇开启范围检查。': 'The current position passes wall, overlap, and door swing checks.',
  '当前房间没有标注房门。': 'No doors are marked in this room.',
  '按家具库占地找到该位置，通过边界、重叠和开门检查。': 'The catalog footprint fits here and passes wall, overlap, and door swing checks.',
  '请检查家具占地和房门开启范围。': 'Check furniture footprints and door swings.',
  '客厅 + 卧室 + 书房 · 46.6 m²': 'Living room + bedroom + study · 46.6 m²',
  '横厅 + 主卧 + 次卧 · 56.0 m²': 'Living room + main bedroom + second bedroom · 56.0 m²',
  '按本次要求': 'Follow this request', '通行优先': 'Prioritize circulation', '会客优先': 'Prioritize seating',
  '兼顾入座、茶几摆放和进门通行，适当增加中央留白': 'Balance seating, coffee table placement, and entry access while opening up the center',
  '保留入座和通行空间，增加中央留白': 'Open up the center while preserving seating access and circulation',
  '清出门扇开启范围，改善进门通行': 'Clear door swings and improve entry access',
  '改善入座空间和茶几摆放': 'Improve seating access and coffee table placement',
  '当前房间的空位': 'an open spot in the current room',
  '原位置': 'Original position', '建议位置': 'Suggested position',
  '移动家具': 'Move furniture', '移动位置': 'Move item', '微调位置': 'Make a small adjustment',
  '超出房间边界': 'Outside the room boundary', '占用房门开启区域': 'Blocks the door swing',
  '房间净高请填写 2 至 5 米范围内的实测值。': 'Enter a measured ceiling height between 2 and 5 m.',
  '房型存档格式不匹配，已载入示例；原存档未改写。': 'The saved floor plan has an incompatible format. A sample was loaded; the original save is intact.',
  '检测到存档家具越界，已移回墙内，请重新保存。': 'Furniture outside the room was moved inside. Save again to keep the correction.',
  '所选家具包含锁定物件，请先解锁。': 'Unlock the locked items in the selection first.',
  '松手放置 · Esc 取消': 'Release to place · Esc to cancel',
  '松手将恢复原位': 'Release to restore the original position',
  '已恢复拖动前的位置': 'Original position restored',
  '已到墙边，松手放置或沿墙移动。': 'At the wall. Release to place or drag along the wall.',
  '已取消本次拖动。': 'Drag canceled.',
  '已确认移动及让位，一次撤销可全部恢复。': 'Both moves applied. Undo restores both items.',
  '已停在墙内边界。': 'Placed inside the wall boundary.',
  '已放置家具，可撤销调整。': 'Furniture placed. You can undo this move.',
  '已选中锁定家具，可查看属性或解锁。': 'Locked furniture selected. You can inspect or unlock it.',
  '已选中家具；再次按住拖动可移动。': 'Furniture selected. Drag it again to move it.',
  '已选中，直接拖动可移动家具。': 'Furniture selected. Drag to move it.',
  '已选中家具。': 'Furniture selected.',
  '已选中门窗，可查看属性。': 'Door or window selected. You can inspect its properties.',
  '家具已锁定，请先解锁；拖动不会启动框选。': 'Unlock this furniture before moving it. Dragging it does not start a box selection.',
  '测量：再点击一个位置，查看两点间距离。': 'Measure: click another point to see the distance.',
  '测量完成；继续点击可开始下一次测量。': 'Measurement complete. Click to start another measurement.',
  '已取消测量。': 'Measurement canceled.',
  '正在旋转视角 · 松开右键结束。': 'Rotating the view · Release the right button to finish.',
  '2D 模式保持俯视；请切换到 3D 空间后按住右键旋转。': 'The 2D view stays top-down. Switch to 3D and right-drag to rotate.',
  '2D 模式保持俯视；请切换到 3D 后旋转。': 'The 2D view stays top-down. Switch to 3D to rotate.',
  '视角已调整 · 家具位置保持不变。': 'View rotated · Furniture positions are unchanged.',
  '右键用于旋转视角；点击空白处或按 Esc 可取消选择。': 'Right-drag rotates the view. Click empty space or press Esc to clear the selection.',
  '全屋三维地图': 'Whole-home 3D map', '房间编辑画布': 'Room editor canvas',
  '3D 未能启动，请使用开启硬件加速的 Chrome 或 Edge。': '3D could not start. Use Chrome or Edge with hardware acceleration enabled.',
  '正在载入真实家具模型…': 'Loading furniture models…',
  '部分模型未能载入，暂用替代形状。': 'Some furniture models could not load. Showing substitute shapes.',
  '部分家具模型加载失败，暂用替代形状。': 'Some furniture models could not load. Showing substitute shapes.',

  '当前房间里没有这件家具。': 'This item is not in the current room.',
  '这件家具已锁定。': 'This item is locked.',
  '目标位置无效。': 'The target position is invalid.',
  '目标位置超出墙内边界。': 'The target position is outside the room.',
  '目标位置占用房门开启区域。': 'The target position blocks the door swing.',
  '这套方案没有可应用的位置变化。': 'This proposal contains no moves to apply.',
  '找不到当前房间。': 'The current room could not be found.',
  '方案包含无效位置。': 'The proposal contains an invalid position.',
  '方案包含重复家具。': 'The proposal lists an item more than once.',
  '方案包含其他房间或已删除的家具。': 'The proposal refers to furniture in another room or to a deleted item.',
  '这件家具当前不可移动。': 'This furniture cannot be moved right now.',
  '请选择未锁定的家具。': 'Select an unlocked item.',
  '请确认你想靠哪一扇窗。': 'Which window should the furniture go near?',
  '请指出家具要靠哪一侧墙面或哪一扇窗。': 'Specify which wall or window the furniture should go near.',
  '可以试其他墙面，或先腾出该处空间。': 'Try another wall or clear some space there first.',
  '这个位置符合指定的移动要求，且通过墙内边界、重叠和挡门检查。': 'This position matches the requested move and passes boundary, overlap, and door swing checks.',
  '其他家具保持原位。': 'Other furniture stays in place.',
  '其他家具保持原位，涉及的开门范围已释放。': 'Other furniture stays in place. The affected door swings are clear.',
  '其他家具保持原位，目标位置已通过重叠和挡门检查。': 'Other furniture stays in place. The target position passes overlap and door swing checks.',
  '当前房间没有已标注的房门。': 'The current room has no marked doors.',
  '请先添加门的位置。': 'Add a door location first.',
  '当前家具缺少可参照的会客座位或桌几。': 'There is no seat or table to use as a reference for conversation spacing.',
  '请选择一件会客区家具，或指定落点。': 'Select a seating-area item or specify a position.',
  '请说明要把哪件家具与哪件家具对齐。': 'Which two pieces of furniture should line up?',
  '请告诉我希望移到哪个位置，例如靠北墙或靠近窗边。': 'Where should it go? For example, near the north wall or by a window.',
  '目标位置超出当前房间。': 'The target position is outside the current room.',
  '请指出房间内的墙面、窗边或家具作为参照。': 'Use a wall, window, or piece of furniture in the room as a reference.',
  '可以保留现状，或指定另一件家具。': 'Keep the current layout or choose another item.',
  '可以保留现状，或换一个对齐参照。': 'Keep the current layout or choose another alignment reference.',
  '墙边界、开门范围和其他家具需要同时留出。': 'The move must respect the walls, door swings, and other furniture.',
  '可以换一件家具或调整目标。': 'Try a different item or adjust the goal.',
  '把这件家具移离房间中央，为中央活动区留出空间。': 'Move this item away from the center to make more room for activities.',
  '把这件家具移到开门范围以外，为房门留出空间。': 'Move this item out of the door swing so the door can open.',
  '在目标附近找一处容得下这件家具的空位。': 'Find an open spot near the target that fits this item.',

  '这个方案会让茶几偏离沙发正面，或者变得不方便取放。': 'This plan would move the coffee table out of line with the sofa or make it harder to reach.',
  '茶几与沙发前方的相对位置仍不便于取放。': 'The coffee table is still hard to reach from the sofa.',
  '为同一套摆放方案协调位置，避开其他家具和开门范围。': 'Coordinate this position with the rest of the layout while keeping other furniture and door swings clear.',
  '原位置占用房门开启范围，移动后门扇可避开这件家具。': 'The item blocks the door at its original position. Moving it clears the swing.',
  '原位置与其他家具重叠，移开后消除重叠。': 'Moving this item resolves an overlap at its original position.',
  '移回墙内，留出足够的家具占地。': 'Move the item inside the walls so its footprint fits.',
  '给座位正面留出更多入座空间。': 'Leave more space in front of the seat.',
  '让茶几更靠近沙发正前方，方便坐下后取放物品。': 'Bring the coffee table in front of the sofa so it is easier to reach while seated.',
  '减少这件家具在房间中央的占用。': 'Free up more space in the center of the room.',
  '最终位置通过家具重叠、墙内边界和开门范围检查。': 'The final position passes overlap, boundary, and door swing checks.',
  '请按当前布局重新生成方案。': 'Generate a new proposal for the current layout.',
  '当前家具通过墙内边界、重叠和开门范围检查。': 'The current layout passes boundary, overlap, and door swing checks.',
  '要消除这处冲突，请先调整它的保留条件。': 'To resolve this conflict, first allow this item to move.',
  '按当前朝向和保留条件，没有找到更合适的平移方案。': 'No better arrangement was found with the current orientations and fixed items.',
  '可先调整朝向或重新指定要保留的家具。': 'Try adjusting orientations or choosing which furniture must stay in place.',
  '你还想检查哪件家具，或看看其他摆法？': 'Would you like to check another item or try a different arrangement?',
  '当前房间缺少可同时比较的座椅和桌几。': 'There is no seat and table pair to compare in this room.',
  '你想先改善门口空间还是中央留白？': 'Would you like to improve entry access or open up the center first?',
  '在当前尺寸、朝向和保留条件下，这次搜索未找到整套合法位置。': 'The search found no valid arrangement with the current dimensions, orientations, and fixed items.',
  '你想预览这套方案吗？': 'Would you like to preview this proposal?',

  '请先在户型中添加门的位置和开启方向。': 'Add the door location and swing direction to the floor plan first.',
  '这项检查只确认房门标注尺寸，门洞实际净宽和进门后的连续通行宽度仍需测量。': 'This check uses the marked door dimensions. Measure the actual clear opening and the path beyond it.',
  '当前每次只能预览一件家具的位置。': 'Only one item can be previewed at a time.',
  '你希望先检查哪件家具的移法？': 'Which item would you like to try moving first?',
  '要调整它的位置，请先解锁或修改保留条件。': 'Unlock the item or allow it to move before adjusting it.',
  '你想先移哪一件？': 'Which item do you want to move first?',
  '可以先调整别的家具，再重新检查。': 'Try moving other furniture, then check again.',

  '建议与当前房间不匹配，请重新生成。': 'The suggestion does not match this room. Generate a new suggestion.',
  '当前房间已使用这款墙面材质。': 'This room already uses that wall finish.',
  '建议中的家具已存在，请重新生成。': 'The suggested item already exists. Generate a new suggestion.',
  '这个位置会越界、挡门或与家具重叠，请重新生成。': 'This position crosses a wall, blocks a door, or overlaps furniture. Generate a new suggestion.',
  '你想换成哪一款？': 'Which finish would you like?',
  '这个建议只改当前房间的墙面，家具和地板保持原样。': 'Only the current room’s wall finish changes. Furniture and flooring stay the same.',
  '可以建议添加家具或更换当前房间的墙面。': 'I can suggest adding furniture or changing the current room’s wall finish.',
  '你想做哪一种调整？': 'Which change would you like?',
  '你想添加哪一种？': 'Which item would you like to add?',
  '当前房间已达到助手可处理的家具数量，请先移除不需要的家具。': 'This room has reached the assistant’s furniture limit. Remove any items you no longer need first.',
  '没有找到对应的窗户，请指定当前房间哪一扇窗。': 'I could not find that window. Specify a window in the current room.',
  '请指定要靠近的墙面：东、南、西或北。': 'Specify the east, south, west, or north wall.',
  '请提供有效的家具位置，或让我在当前房间找空位。': 'Provide a valid position or let me find an open spot in the room.',
  '现有家具保持原位，可以先在画布预览。': 'Existing furniture stays in place. Preview the change on the canvas.',

  '你想先了解当前布局的哪一部分？': 'Which part of the current layout would you like to look at first?',
  '你指的是哪件家具？': 'Which piece of furniture do you mean?',
  '请告诉我想调整哪件家具或优先改善哪块空间。': 'Tell me which item to move or which area to improve first.',
  '只能为当前房间生成改动建议，请先切换到要编辑的房间。': 'Suggestions apply to the current room. Switch to the room you want to edit first.',
  '有家具无法对应到当前房间，请先在画布确认对象。': 'I could not identify some furniture in this room. Confirm the items on the canvas first.',
  '请预览上一次建议。': 'Preview the previous suggestion.',
  '当前没有可以继续的预览。': 'There is no preview to continue.',
  '请说明想调整哪件家具或哪块空间。': 'Tell me which item or area you want to adjust.',
  '当前房间找不到这件家具。': 'I could not find this item in the current room.',
  '你是想检查挡门情况，还是试着腾出开门范围？': 'Do you want to check whether the door is blocked or try clearing its swing?',
  '当前房间没有可以检查的房门。': 'There are no doors to check in the current room.',
  '请告诉我想调整哪件家具，也可以先在画布选中它。': 'Tell me which item to adjust, or select it on the canvas first.',
  '你可以选择其他家具。': 'You can select another item.',
  '请说明怎么调整，例如靠墙、给中央留空，或给出移动方向和距离。': 'Describe the change: for example, move an item toward a wall, clear the center, or provide a direction and distance.',
  '这轮未生成可预览方案。': 'This reply contains no proposal to preview.',
  '未配置 DeepSeek 密钥。保存本地配置后请重启 SpaceMate。': 'No DeepSeek key is configured. Restart SpaceMate after saving your local configuration.',
  'DeepSeek 密钥无效，请更新本地密钥后重启。': 'The DeepSeek key is invalid. Update your local key and restart SpaceMate.',
  'DeepSeek 账户余额不足。': 'The DeepSeek account has insufficient balance.',
  'DeepSeek 请求过多，请稍后再试。': 'DeepSeek is receiving too many requests. Try again later.',
  '暂时没有收到可读取的布局答复，请重试。': 'No readable layout reply was received. Try again.',
  'DeepSeek 没有返回可显示的回复，请重试。': 'DeepSeek did not return a displayable reply. Try again.',
  '等待 DeepSeek 回复超时，请重试。': 'The DeepSeek request timed out. Try again.',
  'DeepSeek 返回了无法读取的回复，请重试。': 'DeepSeek returned an unreadable reply. Try again.',
  '无法连接 DeepSeek，请检查网络后重试。': 'Could not connect to DeepSeek. Check your connection and try again.',
  '聊天接口只支持 POST。': 'The chat endpoint only accepts POST.',
  '请从 SpaceMate 页面发起聊天。': 'Start the chat from SpaceMate.',
  '聊天请求必须使用 JSON。': 'Chat requests must use JSON.',
  '聊天内容过长，请缩短消息后重试。': 'The chat content is too long. Shorten the message and try again.',
  '读取聊天请求失败，请重试。': 'The chat request could not be read. Try again.',
  '聊天请求必须是有效的 JSON。': 'The chat request must be valid JSON.',
  '聊天消息格式有误或内容过长，请修改后重试。': 'The chat message is invalid or too long. Edit it and try again.',
  '当前房间数据无法用于布局建议，请检查房间和家具信息。': 'The current room data cannot be used for suggestions. Check the room and furniture details.',
};

type Rule = readonly [RegExp, (...captures: string[]) => string];

const patterns: readonly Rule[] = [
  [/^已保存布局，(.+?)有 (\d+) 项需要关注。$/u, (room,count) => `Layout saved. ${name(room)} has ${count} ${count==='1'?'item':'items'} to review.`],
  [/^(.+?)：(.+?(?:越界|超出房间边界|重叠|占用房门开启区域).*)$/u, (item,issues) => `${name(item)}: ${issues.split('、').map(toEnglish).join(', ')}`],
  [/^(.+?)的标注门宽小于 (.+?)。$/u, (door,width) => `The marked width of the ${name(door)} is under ${distance(width)}.`],
  [/^(.+?)前方可用深度约 (.+?)，入座空间偏小。$/u, (item,depth) => `${name(item)} has about ${distance(depth)} of clear space in front. Seating access is tight.`],
  [/^(.+?)的(床侧进出|柜前取物)空间偏小，当前约 (.+?)。$/u, (item,kind,depth) => `${name(item)} has about ${distance(depth)} of clearance for ${access(kind)}.`],
  [/^(.+?) · 按当前户型估算$/u, item => `${name(item)} · Estimated from the current layout`],
  [/^座椅前方可用深度(至少|约) (.+?)。$/u, (bound,depth) => `Clear space in front of the seat: ${bound==='至少'?'at least':'about'} ${distance(depth)}.`],
  [/^与(.+?)的最近边缘间距约 (.+?)。$/u, (item,gap) => `The nearest edge to ${name(item)} is about ${distance(gap)} away.`],
  [/^(.+?)到中央(未检出|检出)约 (.+?)宽的通路。$/u, (door,status,width) => `${status==='检出'?'Found':'Did not find'} a path about ${distance(width)} wide from the ${name(door)} to the room center.`],
  [/^图中标出座椅前方的 (.+?)入座检查区域。$/u, amount => `The view marks the ${distance(amount)} seating clearance area in front of the seat.`],
  [/^按户型估算，门全开时检出从门口到房间中央的 (.+?)通路。$/u, width => `The layout model found a ${distance(width)} path from the doorway to the room center with the door open.`],
  [/^按户型估算，部分房门至中央未检出 (.+?)通路。$/u, width => `The layout model did not find a ${distance(width)} path from every doorway to the room center.`],
  [/^这个方案会挤窄(.+?)的(床侧进出|柜前取物)空间。$/u, (item,kind) => `This proposal would reduce clearance around ${name(item)} for ${access(kind)}.`],
  [/^这个方案会让(.+?)与(.+?)的相对位置不利于(坐下后取放|坐下后使用书桌)。$/u, (chair,table,use) => `This proposal would make ${name(table)} harder to ${use==='坐下后取放'?'reach':'use'} from ${name(chair)}.`],
  [/^(.+?)的(床侧进出|柜前取物)空间仍偏小。$/u, (item,kind) => `${name(item)} still has limited clearance for ${access(kind)}.`],
  [/^(.+?)的(床侧进出|柜前取物)深度估计由 (.+?) 增至(至少|约) (.+?)。$/u, (item,kind,before,bound,after) => `Estimated ${access(kind)} clearance around ${name(item)} increases from ${distance(before)} to ${bound==='至少'?'at least':'about'} ${distance(after)}.`],
  [/^(.+?)与(.+?)的边缘间距约 (.+?)。$/u, (chair,table,gap) => `The edge-to-edge gap between ${name(chair)} and ${name(table)} is about ${distance(gap)}.`],
  [/^(.+?)与(.+?)的间距偏大。$/u, (chair,table) => `${name(chair)} and ${name(table)} are far apart for use together.`],
  [/^已框选 (\d+) 件家具，已跳过锁定物件。$/u, count => `Box-selected ${countItems(count)}. Locked items were skipped.`],
  [/^(\d+) 件家具$/u, countItems],
  [/^(\d+) 处摆放提示$/u, count => `${count} placement ${count === '1' ? 'warning' : 'warnings'}`],
  [/^(.+?)将让位 · 松手一起确认，Esc 一起取消$/u, item => `${name(item)} will make room · Release to place both, or press Esc to cancel`],
  [/^(.+) · (松手将恢复原位|已恢复拖动前的位置)$/u, (error, action) => `${toEnglish(error)} · ${phrases[action]}`],
  [/^(.+?)挡住开门范围$/u, item => `${name(item)} blocks the door swing`],
  [/^与(.+?)重叠$/u, item => `Overlaps ${name(item)}`],
  [/^(.+?)中有家具高于房间净高，请先修改家具尺寸。$/u, room => `Some furniture in ${name(room)} exceeds the ceiling height. Adjust its dimensions first.`],
  [/^(.+?)的门洞超出墙面，请先调整门洞位置或尺寸。$/u, room => `A door opening in ${name(room)} extends beyond the wall. Adjust its position or size first.`],
  [/^(.+?)的窗洞超出墙面，请先调整窗台、位置或尺寸。$/u, room => `A window opening in ${name(room)} extends beyond the wall. Adjust its sill, position, or size first.`],
  [/^(.+?)在当前朝向放不进(.+?)，请先调整尺寸或朝向。$/u, (item, room) => `${name(item)} does not fit in ${name(room)} at its current orientation. Adjust its size or rotation first.`],
  [/^调整会使已锁定的(.+?)穿墙，请先解锁或增大房间。$/u, item => `This change would push the locked ${name(item)} through a wall. Unlock it or enlarge the room first.`],
  [/^(房门|窗户) · ([\d.]+ × [\d.]+ m)$/u, (label, size) => `${name(label)} · ${size}`],
  [/^(原位置|建议位置) · (.+)$/u, (position, item) => `${phrases[position]} · ${name(item)}`],
  [/^(.+?)( · 已锁定)?  ([\d.]+ × [\d.]+ m)$/u, (item, locked, size) => `${name(item)}${locked ? ' · Locked' : ''}  ${size}`],
  [/^目标位置与(.+?)重叠。$/u, item => `The target position overlaps ${name(item)}.`],
  [/^(.+?(?:已锁定|需保持原位)(?:、.+?(?:已锁定|需保持原位))+)。$/u, locked => locked.split('、').map(part => toEnglish(part + '。')).join(' ')],
  [/^(.+?)(需要保持原位|已锁定|需保持原位)。$/u, (item, status) => `${name(item)} ${status === '已锁定' ? 'is locked' : 'must stay in place'}.`],
  [/^(.+?)超出墙内边界。$/u, item => `${name(item)} crosses the wall boundary.`],
  [/^(.+?)占用房门开启范围。$/u, item => `${name(item)} blocks the door swing.`],
  [/^(.+?)与(.+?)重叠。$/u, (item, other) => `${name(item)} overlaps ${name(other)}.`],
  [/^(.+?)已在指定位置。$/u, item => `${name(item)} is already at the requested position.`],
  [/^无法按指定距离移动(.+?)。$/u, item => `Could not move ${name(item)} by the requested distance.`],
  [/^向([东西南北]{1,2})平移 (.+?)，其他位置和朝向保持原样。$/u, (heading, amount) => `Move ${distance(amount)} ${direction(heading)}. Other positions and orientations stay the same.`],
  [/^当前房间(?:([东西南北])墙)?没有已标注的窗口。$/u, wall => `The current room has no marked windows${wall ? ` on the ${direction(wall)} wall` : ''}.`],
  [/^(.+?)以当前朝向放不进墙内。$/u, item => `${name(item)} does not fit inside the room at its current orientation.`],
  [/^在(.+?)没有找到能放下(.+?)的落点。$/u, (location, item) => `No spot near ${name(location)} fits ${name(item)}.`],
  [/^最接近目标的点：(.+)$/u, reason => `Closest point to the target: ${toEnglish(reason)}`],
  [/^(.+?)已经在(.+?)，可以保留原位。$/u, (item, location) => `${name(item)} is already by ${name(location)} and can stay there.`],
  [/^已找到(.+?)可放下(.+?)的位置，可以预览。$/u, (location, item) => `A spot for ${name(item)} was found by ${name(location)}. Preview it on the canvas.`],
  [/^向([东西南北]{1,2})(?:平移)?(约)? (\d+(?:\.\d+)? ?(?:米|毫米|厘米|公分|m|cm|mm))$/u,
    (heading, approximate, amount) => `Move ${approximate ? 'about ' : ''}${distance(amount)} ${direction(heading)}`],
  [/^当前位置占用(.+?)的开启范围，移动后可避开门扇。$/u, doors => `The item blocks the swing of ${name(doors)}. Moving it clears the swing.`],
  [/^房间中心到家具占地的距离由 (.+?) 增至 (.+?)。$/u, (before, after) => `The distance from the room center to the item footprint increases from ${distance(before)} to ${distance(after)}.`],
  [/^放置后离最近门口更远，地面距离由 (.+?) 增至 (.+?)。$/u, (before, after) => `The floor distance to the nearest doorway increases from ${distance(before)} to ${distance(after)}.`],
  [/^这个位置更接近目标点，距目标约 (.+?)，且可放下这件家具。$/u, amount => `This position fits the item and is about ${distance(amount)} from the target.`],
  [/^落点位于(.+?)，已通过重叠和挡门检查。$/u, location => `The position is by ${name(location)} and passes overlap and door swing checks.`],
  [/^与(.+?)的中心线偏差由 (.+?) 降至 (.+?)。$/u, (item, before, after) => `The centerline offset from ${name(item)} decreases from ${distance(before)} to ${distance(after)}.`],
  [/^调整与(.+?)的会客间距，保留原来的相对方位。$/u, item => `Adjusts conversation spacing from ${name(item)} while staying on the same side.`],
  [/^与(.+?)最?近间距(?:仍约|保持约) (.+?)。$/u, (item, amount) => `The closest gap to ${name(item)} stays about ${distance(amount)}.`],
  [/^与(.+?)最?近间距(?:由约|从约) (.+?) 变为 (.+?)。$/u, (item, before, after) => `The closest gap to ${name(item)} changes from about ${distance(before)} to ${distance(after)}.`],
  [/^其他家具保持原位，(.+?)仍占用开门范围。$/u, items => {
    const count = /^另有 (\d+) 件家具$/u.exec(items);
    return `Other furniture stays in place. ${count ? `${countItems(count[1])} ${count[1] === '1' ? 'is' : 'are'}` : `${name(items)} is`} still in the door swing.`;
  }],
  [/^其他家具保持原位，(与.+?最近间距.+。)$/u, gap => `Other furniture stays in place. ${toEnglish(gap)}`],
  [/^位移约 (.+?)(?:（(.+?)）)?，朝向保持原样。$/u, (amount, legs) => `Move about ${distance(amount)}${legs ? ` (${legs.split('、').map(toEnglish).join(', ')})` : ''}. The orientation stays the same.`],
  [/^(.+?)仍占用相关开门范围。$/u, items => `Still in the affected door swings: ${list(items)}.`],
  [/^(.+?)与(.+?)的中心线已经基本对齐，可以保留原位。$/u, (item, other) => `${name(item)} already lines up with ${name(other)} and can stay in place.`],
  [/^(.+?)在保持原来这一侧的前提下，没有找到能改善会客间距的小幅移动。$/u, item => `No small move was found that improves seating spacing while keeping ${name(item)} on the same side.`],
  [/^在(.+?)附近没有找到能对齐且不挡门、不重叠的位置。$/u, item => `No nearby position lines up ${name(item)} without blocking a door or overlapping furniture.`],
  [/^(.+?)没有找到能改善这个目标的空位。$/u, item => `No open spot for ${name(item)} was found that improves this goal.`],
  [/^小幅调整与(.+?)的距离，家具仍在原来这一侧。$/u, item => `Adjust the distance to ${name(item)} slightly while staying on the same side.`],
  [/^将这件家具和(.+?)的中心线对齐。$/u, item => `Align this item’s centerline with ${name(item)}.`],

  [/^这个落点会缩小(.+?)前方的可用空间。$/u, item => `This placement would reduce the space in front of ${name(item)}.`],
  [/^这个方案会缩窄(.+?)通向房间中央的通路。$/u, door => `This plan would narrow the path from the ${name(door)} to the center of the room.`],
  [/^(.+?)前方可用深度约 (.+?)，入座空间仍偏小。$/u, (item, amount) => `There is about ${distance(amount)} of space in front of ${name(item)}. Seating access is still tight.`],
  [/^(.+?)的标注门宽约 (.+?)，低于本次的 (.+?) 通行检查宽度。$/u, (door, width, minimum) => `The marked width of the ${name(door)} is about ${distance(width)}, below the ${distance(minimum)} used for this passage check.`],
  [/^从(.+?)到房间中央未检出约 (.+?)\s*宽的通路。$/u, (door, width) => `No path about ${distance(width)} wide was found from the ${name(door)} to the room center.`],
  [/^按户型估计，从门口到房间中央有至少 (.+?) 宽的通路。$/u, width => `The floor plan suggests a path at least ${distance(width)} wide from the doorway to the room center.`],
  [/^中央区域的家具占用估计由 (.+?) 变为 (.+?)。$/u, (before, after) => `The estimated furniture footprint in the center changes from ${distance(before)} to ${distance(after)}.`],
  [/^沙发前方可用深度(至少|约) (.+?)。$/u, (bound, width) => `The sofa has ${bound === '至少' ? 'at least' : 'about'} ${distance(width)} of clear space in front.`],
  [/^建议调整 (\d+) 件家具。$/u, count => `Suggested changes for ${countItems(count)}.`],
  [/^当前(.+?)有 (\d+) 件家具涉及重叠、越界或挡门。$/u, (room, count) => `In ${name(room)}, ${countItems(count)} overlap, cross a wall, or block a door.`],
  [/^(.+?)需要保持原位，(.+?)。$/u, (item, reason) => `${name(item)} must stay in place. Issue: ${toEnglish(reason)}.`],
  [/^按「(.+?)」检查，未找到明显改善，建议保留现状。$/u, goal => `No clear improvement was found for “${toEnglish(goal)}.” Keep the current layout.`],
  [/^按「(.+?)」找到了一个可行调整，涉及 (\d+) 件家具。$/u, (goal, count) => `A feasible change was found for “${toEnglish(goal)},” involving ${countItems(count)}.`],
  [/^可以先处理(.+?)的冲突。$/u, item => `Start by resolving the conflict involving ${name(item)}.`],

  [/^当前正在编辑(.+?)。$/u, room => `You are editing ${name(room)}.`],
  [/^请切换到(.+?)后再检查那里的房门。$/u, room => `Switch to ${name(room)} to check its doors.`],
  [/^当前(.+?)的([东西南北])墙没有已标注的房门。$/u, (room, wall) => `No doors are marked on the ${direction(wall)} wall in ${name(room)}.`],
  [/^当前(.+?)没有已标注的房门。$/u, room => `No doors are marked in ${name(room)}.`],
  [/^([东西南北]墙房门(?: \d+)?)的开启范围没有被家具占用。$/u, door => `No furniture blocks the ${name(door)}.`],
  [/^([东西南北]墙房门(?: \d+)?)的开启范围被(.+?)占用。$/u, (door, items) => `The ${name(door)} swing is blocked by ${list(items)}.`],
  [/^(.+?)没有占用所检查房门的开启范围。$/u, items => `No checked door swing is blocked by ${list(items)}.`],
  [/^(.+?)的标注宽度已小于 (.+?)，调整家具也无法达到该宽度。$/u, (doors, width) => `The marked width for ${list(doors)} is under ${distance(width)}. Moving furniture cannot make the opening wider.`],
  [/^((?:[东西南北]墙房门(?: \d+)?标注宽度为 .+?)(?:，[东西南北]墙房门(?: \d+)?标注宽度为 .+?)*)。$/u, widths => widths.split('，').map(part => {
    const marked = /^(.+?)标注宽度为 (.+)$/u.exec(part);
    return marked ? `The ${name(marked[1])} is marked as ${distance(marked[2])} wide.` : part;
  }).join(' ')],
  [/^当前搜索没有找到(.+?)可以单独移入的合法空位。$/u, item => `The search found no valid open spot for ${name(item)} without moving other furniture.`],
  [/^找到的最近合法落点需要移动约 (.+?)，超过你设的 (.+?)。$/u, (amount, maximum) => `The nearest valid position requires moving about ${distance(amount)}, beyond your ${distance(maximum)} limit.`],
  [/^将(.+?)平移约 (.+?) 后，它会离开房门开启范围。$/u, (item, amount) => `Moving ${name(item)} about ${distance(amount)} clears it from the door swing.`],
  [/^([东西南北]墙房门(?: \d+)?仍有.+?占用开启范围(?:，[东西南北]墙房门(?: \d+)?仍有.+?占用开启范围)*)。$/u, blockers => blockers.split(/，(?=[东西南北]墙房门(?: \d+)?仍有)/u).map(part => {
    const block = /^(.+?)仍有(.+?)占用开启范围$/u.exec(part);
    return block ? `The ${name(block[1])} swing is still blocked by ${list(block[2])}.` : part;
  }).join(' ')],

  [/^将墙面更换为(.+?)(。)?$/u, (material, period) => `Change the wall finish to ${name(material)}${period ? '.' : ''}`],
  [/^添加(.+?)(。)?$/u, (item, period) => Object.hasOwn(names, item) ? `Add ${name(item)}${period ? '.' : ''}` : `添加${item}${period ?? ''}`],
  [/^目前可选择：(.+?)。$/u, materials => `Available finishes: ${list(materials)}.`],
  [/^(.+?)已经使用(.+?)，可以保留现状。$/u, (room, material) => `${name(room)} already uses ${name(material)}. You can keep it as is.`],
  [/^家具库目前有：(.+?)。$/u, items => `Available furniture: ${list(items)}.`],
  [/^(.+?)高于当前房间的净高，无法添加。$/u, item => `${name(item)} is too tall for this room and cannot be added.`],
  [/^在(.+?)没有找到能放下(.+?)且不挡门的空位。$/u, (location, item) => `No open spot for ${name(item)} was found in ${name(location)} that keeps the door clear.`],
  [/^建议在(.+?)添加(.+?)（([\d.]+ × [\d.]+) 米）。$/u, (location, item, size) => `Suggested addition: ${name(item)} (${size} m) at ${toEnglish(location)}.`],
  [/^DeepSeek 暂未能处理请求（(\d+)），请稍后再试。$/u, status => `DeepSeek could not handle the request (${status}). Try again later.`],
];

function translatePhrase(value: string): string {
  if (Object.hasOwn(phrases, value)) return phrases[value];
  const label = name(value);
  if (label !== value) return label;
  for (const [pattern, render] of patterns) {
    const match = pattern.exec(value);
    if (match) return render(...match.slice(1));
  }
  return value;
}

export function toEnglish(value: string): string {
  if (!/\p{Script=Han}/u.test(value)) return value;
  if (Object.hasOwn(phrases, value)) return phrases[value];
  const pieces = value.match(/[^。！？；\n]+[。！？；]?|[。！？；\n]/gu);
  if (!pieces || pieces.length <= 1) return translatePhrase(value);
  const localized = pieces.map(piece => {
    const trimmed = piece.trimStart();
    const translation = translatePhrase(trimmed);
    return {source: piece, text: translation === trimmed ? piece : translation, translated: translation !== trimmed};
  });
  return localized.map(({text, translated}, index) => {
    const previous = localized[index-1];
    return previous && previous.source !== '\n' && text !== '\n' && (translated || previous.translated)
      && !/^\s/u.test(text) && !/\s$/u.test(previous.text) ? ' ' + text : text;
  }).join('');
}
