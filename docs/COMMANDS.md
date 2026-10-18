# SPACE REALM · 星海境界 指令手册

> 适用版本：SpaceRealm v0.9.7 · 运行时指令终端
> 手册位置：`docs/COMMANDS.md`（游戏内输入 `/commands` 可查看路径，`/help` 查看摘要）

---

## 1. 打开终端

| 操作 | 说明 |
| --- | --- |
| <kbd>`</kbd>（反引号 / Backquote） | 在任意界面打开指令终端 |
| <kbd>/</kbd> | 在非输入状态下同样打开终端 |
| <kbd>Esc</kbd> | 关闭终端 |
| <kbd>↑</kbd> / <kbd>↓</kbd> | 浏览历史指令 |
| <kbd>Tab</kbd> | 自动补全第一条匹配的指令 |
| <kbd>Enter</kbd> | 执行指令 |

> 初次进入一个星系时，导航协议会直接将旅行者同步到母星地表。之后按 <kbd>M</kbd> 打开银河星图，或用 `ESC` 地表终端返回近地轨道。

指令输入可以带前导斜杠，也可以省略：`/help` 与 `help` 等价。指令大小写不敏感。参数中含空格时可用英文双引号包裹。

所有指令与玩家存档、当前界面状态联动。需要地表的指令必须降落在行星上；需要恒星系的指令必须处于恒星系视图。

---

## 2. 核心 / 终端

| 指令 | 别名 | 说明 | 示例 |
| --- | --- | --- | --- |
| `/help [指令]` | `?`, `cmd` | 显示全部指令，或某条指令的详情 | `/help summonship` |
| `/commands` | `cmds` | 显示完整指令手册位置 | `/commands` |
| `/helpcat <分类>` | `category` | 按分类分页显示指令 | `/helpcat 航行` |
| `/clear` | `cls` | 清空终端输出 | `/clear` |
| `/version` | `ver` | 查看版本与运行时信息 | `/version` |
| `/save` | `store` | 立即写入本地存档 | `/save` |
| `/reload` | `restart` | 重新加载游戏页面 | `/reload` |
| `/reset confirm` | `resetworld` | 清空全部存档并重新开始，必须带 `confirm` | `/reset confirm` |

---

## 3. 玩家 / 修炼

| 指令 | 别名 | 说明 | 示例 |
| --- | --- | --- | --- |
| `/xp <数值> [set]` | `exp` | 增加修为；带 `set` 时先设置当前级经验 | `/xp 5000` |
| `/level <1-99>` | `lvl` | 直接设置旅行者等级并同步境界 | `/level 12` |
| `/heal` | `hp` | 恢复全部生命值 | `/heal` |
| `/hurt <数值>` | `damage` | 对自己造成伤害（测试） | `/hurt 20` |
| `/mana` | `mp` | 补满法力 | `/mana` |
| `/stamina` | `sp` | 补满体力 | `/stamina` |
| `/god` | `invincible` | 切换本次地表会话的无敌状态 | `/god` |
| `/kill` | `die` | 结束当前生命，进入重生界面 | `/kill` |
| `/respawn` | `revive` | 在当前着陆点复活 | `/respawn` |
| `/fly` | `flightmode` | 切换反重力飞行；生存模式消耗法力 | `/fly` |
| `/noclip` | `ghost` | 切换地形碰撞忽略 | `/noclip` |
| `/speed <倍率>` | `movespeed` | 设置地表移动速度倍率 0.2–10 | `/speed 2.5` |
| `/mode <模式>` | `gamemode` | 切换 `survival`（生存）或 `creative`（造物） | `/mode creative` |
| `/fov <40-110>` | `fieldofview` | 设置摄像机视场角 | `/fov 84` |

### 境界参考

| 大境界 | 等级 | 说明 |
| --- | --- | --- |
| 凡人 | 1 | 初始境界 |
| 炼气 | 4 | 引星辉入体 |
| 筑基 | 8 | 解锁星舰召唤 |
| 金丹 | 13 | 破坏力显著提升 |
| 元婴 | 18 | 神识覆盖 |
| 化神 | 24 | 掌控局部天象 |
| 炼虚 | 30 | 折叠近地空间 |
| 合体 | 37 | 山岳级力量 |
| 大乘 | 44 | 动摇地壳 |
| 渡劫 | 52 | 行星雷劫 |
| 地仙 | 60 | 陆地真仙 |
| 星君 | 70 | 恒星系权柄 |
| 宇宙主宰 | 82 | 一念星河 |

修为需求按 `120 × 1.265^(等级-1)` 指数增长；破坏力按 `1.185^(等级-1)` 指数增长。每级会恢复并提升生命、法力、体力上限。

---

## 4. 物品 / 合成

可用物品 ID：

`dirt` 沃土、`stone` 岩石、`wood` 木质纤维、`fiber` 植物纤维、`iron` 铁矿石、`titanium` 钛矿、`crystal` 星髓晶、`ice` 冰晶、`bio` 异星孢子、`exotic` 奇点尘埃、`scrap` 合金残骸、`beacon` 星舰信标、`medkit` 纳米修复剂、`manaVial` 星髓浓缩液、`ration` 营养凝胶、`stonePick` 石质采掘镐、`ironPick` 铁质采掘镐、`plasmaDrill` 等离子掘进器、`terraformer` 物质凝铸器、`pulseRifle` 脉冲步枪、`starblade` 星陨长剑、`annihilator` 湮灭炮、`singularityCore` 曲率核心、`shipDrive` 跃迁引擎。

| 指令 | 别名 | 说明 | 示例 |
| --- | --- | --- | --- |
| `/give <物品> [数量]` | `item` | 获得物品，支持 ID 或中文名 | `/give crystal 20` |
| `/giveall [数量]` | `allitems` | 获得所有物品各一组 | `/giveall 32` |
| `/take <物品> [数量]` | `removeitem` | 移除物品 | `/take stone 10` |
| `/craft <配方ID>` | `make` | 无需材料直接制造配方产物（调试） | `/craft starblade` |
| `/equip <装备>` | `use` | 切换工具/武器 | `/equip plasmaDrill` |
| `/inventory` | `inv`, `bag` | 列出当前背包 | `/inventory` |

合成配方：`beacon`、`stone_pick`、`iron_pick`、`terraformer`、`plasma_drill`、`pulse_rifle`、`starblade`、`annihilator`、`medkit`、`manavial`、`ration`、`core`、`drive`。可在游戏内按 <kbd>C</kbd> 打开合成终端查看材料需求。

---

## 5. 世界 / 地形

| 指令 | 别名 | 说明 | 示例 |
| --- | --- | --- | --- |
| `/time` | `settime`, `stardate` | 读取当前星历 | `/time` |
| `/time set <天数>` | | 设置星历日 | `/time set 120.5` |
| `/time speed <倍率>` | | 设置星历流速 | `/time speed 600` |
| `/time day` / `/time night` | | 扫描并跳转到当地白昼/夜晚 | `/time night` |
| `/time pause` | | 暂停星历 | `/time pause` |
| `/weather <类型>` | `w` | 切换天气 | `/weather storm` |
| `/gravity <0.1-4>` | `g` | 设置地表重力倍率 | `/gravity 1.6` |
| `/seed` | `seedinfo` | 查看星系与地表种子 | `/seed` |
| `/where` | `pos`, `coords` | 显示当前位置 | `/where` |
| `/dig [半径]` | `excavate` | 沿视线瞬间挖出球状空腔，可用于验证挖地道 | `/dig 5` |
| `/place [半径]` | `terraform` | 在视线落点凝铸地形 | `/place 2` |
| `/pulse` | `shock` | 释放灵能脉冲 | `/pulse` |
| `/spawn [星鹿]` | `summon` | 在附近召唤生态生物 | `/spawn` |
| `/killall` | `clearcreatures` | 移除附近所有生物 | `/killall` |

天气类型：`clear` 晴朗、`cloudy` 多云、`overcast` 阴天、`rain` 降雨、`storm` 雷暴、`snow` 降雪、`fog` 浓雾、`dust` 沙尘暴、`ash` 火山灰。

> 无生命星球没有云层，只接受 `clear` / `fog` / `dust` / `ash`；云雨类指令会被拒绝。地形破坏后，失去地面支撑的草、树、灌木、花朵与岩石会自动清除。

---

## 6. 航行 / 星图 / 星舰

| 指令 | 别名 | 说明 | 示例 |
| --- | --- | --- | --- |
| `/universe` | `u` | 返回宇宙星系列表 | `/universe` |
| `/galaxy [名称/ID]` | `gx` | 进入星系；无参数回当前星系 | `/galaxy 归墟银河` |
| `/system [名称/ID]` | `sys` | 进入恒星系 | `/system 太阳系` |
| `/orbit` | `leavesurface` | 从地表返回近地轨道；飞行中则退出驾驶 | `/orbit` |
| `/land` | `descend` | 在恒星系视图中降落至选中行星 | `/land` |
| `/home` | `spawnhome` | 回到母星地球着陆点或量子跃迁母星 | `/home` |
| `/tp <x> <y> <z>` | `teleport` | 地表坐标传送 | `/tp 12 45 -8` |
| `/tpplanet <行星>` | `planet` | 跃迁至当前恒星系的行星 | `/tpplanet 地球` |
| `/summonship` | `ship`, `callship` | 强制召唤星舰（可绕过境界限制） | `/summonship` |
| `/launch` | `takeoff` | 星舰从地表升空进入轨道 | `/launch` |
| `/warp <行星>` | `ftl` | 恒星系内曲率跃迁至行星 | `/warp 木星` |
| `/unlock [ship/all]` | `unlockall` | 解锁星舰信标与调试权限 | `/unlock ship` |
| `/scan` | `sysinfo` | 扫描当前恒星系 | `/scan` |

### 星舰流程

1. 地表按 <kbd>V</kbd>（或 `/summonship`）召唤星舰，等待反重力降落动画结束。
2. 靠近星舰后按 <kbd>E</kbd> 登舰，或点击右下角「登舰升空」。
3. 发射过场结束后自动进入恒星系飞行模式，过程中没有加载界面。
4. 鼠标控制航向，<kbd>W</kbd>/<kbd>S</kbd> 推进/制动，<kbd>Shift</kbd> 加力，<kbd>J</kbd> 曲率跃迁到目标，<kbd>L</kbd> 着陆，<kbd>V</kbd>/<kbd>Esc</kbd> 退出星舰。
5. 选择可着陆行星，点击「自动引导着陆」或按 <kbd>L</kbd> 再次进入地表。

---

## 7. 调试 / 显示

| 指令 | 别名 | 说明 | 示例 |
| --- | --- | --- | --- |
| `/quality <high/low>` | `gfx` | 切换画质档位 | `/quality low` |
| `/fullscreen` | `fs` | 切换全屏 | `/fullscreen` |
| `/hud` | `togglehud` | 显示/隐藏地表 HUD | `/hud` |
| `/fps` | `perf` | 报告硬件与画质信息 | `/fps` |
| `/debug` | `dev` | 输出模拟时钟、区块数等调试摘要 | `/debug` |

---

## 8. 推荐调试流程

```text
/giveall 99
/xp 8000
/level 18
/summonship
/launch
```
即可快速体验星舰、无缝升空、恒星系飞行和跃迁。

验证自由地形破坏与地道：

```text
/time day
/weather clear
/equip plasmaDrill
/dig 4
/place 2
```

切换造物模式体验无限法力与无敌建造：

```text
/mode creative
/fly
```

> 注意：`/reset confirm` 会永久删除本地存档。调试指令只影响浏览器本地世界，不会上传服务器。
