当前语音体验修正（preview.10，验证待完成）：设置将助手语音命令与静音、麦克风及输入测试、自然音色及播放示例分别放在一起。打开对话或设置时暂停自动采集和唤醒监听，保留用户同意；此时需主动按麦克风按钮。错误优先于过期的监听提示。内置语音可在主动采集期间准备本地模型，并保持取消与空闲释放。流畅动画使用真实音量及合成变换，尊重隐藏与减少动态效果。实机音质与商业发布条件仍未验收，见[当前 Windows 清单](docs/releases/WINDOWS_COMPLETION_CHECKLIST.md)。

此前 preview.9 修正：语音状态使用独立布局行，紧凑和展开对话都有文字设置按钮，设置沿用对话配色。原有 M 与圆球中心具有可见动画；本地输入拒绝静音和独立识别标记。该范围的验证不代表产品正式完成。

此前 Preview.8 交接：

Preview.8 保留已批准的 Morpheus 设计和现有能力。原有 M 标志采用开场动画；可移动的 56-DIP 助手与连续对话使用真实音频反馈、无障碍控件及减少动态效果设置。设置返回原来的紧凑或展开对话，提供语音字幕、设备测试、个性与安静控制。实时语音发起的 ACP 回复接入现有可取消播放队列，不朗读文字输入或历史记录。内置英语语音复用有界本地进程，包含短播放缓冲、取消和空闲卸载。简单网站命令使用系统默认浏览器，本机为 Chrome。

准确安装包证据、延迟和资源限制及实机/商业发布门槛见[唯一 Windows 清单](docs/releases/WINDOWS_COMPLETION_CHECKLIST.md)；[体验规范](docs/design/MORPHEUS_EXPERIENCE_REVIEW.md)仍为依据。下文 Preview.7 为历史证据，不代表新版本验收。托管方案、支付、签名/更新及 NerdGPT 尚未虚构上线。

<p align="center">
  <img src="src/assets/morpheus-logo.svg" width="128" height="128" alt="Morpheus Logo" />
</p>

<h1 align="center">Morpheus</h1>

[Preview.5 交接](docs/releases/WINDOWS_PREVIEW5_HANDOFF.md) 属于历史记录；交付身份与未完成验收以当前清单为准。

插件压缩包内嵌依赖也采用锁定版本修复，并单独检查安装包中的实际副本和缓存刷新标识。

当前 Phase 7 源码采用右下角助手和向上展开的输入框。返回问候遵守安静设置和已保存的每日记录；
助手对话与神经语音共用已保存的个性偏好。完整验收仍在进行，参见[当前进度](SOL_START_HERE.md)。

原生点击、Escape 和重载恢复已通过重复 Windows 测试，并记录了热启动交互基线。升级准备保留可恢复的安装备份，不再终止其他实例或删除用户资料。这些是源码和辅助程序验证；新安装包仍待验收。

当前交付范围以[固定 Windows 清单](docs/releases/WINDOWS_COMPLETION_CHECKLIST.md)为准，下文旧版本说明仅为历史记录。Preview.4 的真实安装包运行时已通过欢迎、本地任务、受保护的本地模拟供应商、紧凑对话、重载和安静重启，恢复时没有新增模型请求；截图中不再显示内部个性指令。受控 Gateway 中断期间本地任务仍可用，Premium 在 Main 与界面均不可启用。Preview.5 保留原有运行时与界面，仅更新同主版本安全依赖。准确安装包、测试范围与未完成项目见当前检查点；这不等于真实语音、在线服务、安装升级或公开发布验收。

首次使用直接进入已批准的姓名与欢迎界面，键盘焦点保持在对话框内。渲染器存储缺失不会让老用户重复旧安装向导。十个首次启动与返回场景通过 Windows 自动化；包含此修复的 `1.2.0-preview.2` 安装包仍待验收。

正常安装包启动检查发现了简化界面测试未覆盖的 Gateway 环境错误。启动边界已修复并通过真实子进程测试；重建后的安装包仍需正常运行验收。
返回启动保持安静浮球；明确移入托盘不会立即重新显示浮球，也不会启用麦克风。
原有 ACP 桥接现在使用 Main 实际拥有的本地端口。Preview.3 包含这些源码修复；安装包对话验证与单元测试通过是不同的验收项。
地址和令牌通过同一受控子进程环境传递；固定版本运行时的实际认证初始化已加入回归测试，避免命令行地址导致环境认证失效。
紧凑和完整窗口重载现在从原有 ACP 历史恢复，不会再次发送请求。
正常安装包的重载与完整重启现已通过。Preview.4 用明确的显示元数据避免将内部个性上下文显示为用户消息，不改写未标记的历史；重建后的视觉验收仍需完成。

新增源码检查点包括可查看和导出的本地记忆、浮球安静问候、有边界的公开网页读取、
可恢复的静态网站修订与预览，以及不使用 shell 的已批准应用发现。
托管适配器已接入原有 Core 规划器与语音控制器，支持有界的本地音频转换、流式播放和账户切换时取消操作，并保留个人 API 设置。对话接入尚未完成，Premium 仍未上线。
离线用量报告区分已匹配结算的托管费用、运行时估算和未知支出，不代表完整账单或完整支出上限。
隔离的公开浏览器已接入现有任务引擎、权限和实际页面控件，并通过真实 Chromium 场景测试。
登录账户操作和真实网站验收仍未完成；不承诺支持任意网站自动化。
研究流程现可根据实际获取的来源生成带引用的 Markdown 报告，并通过工作区权限保存。
来源卡片和已保存文件预览支持主动打开安全的外部引用；真实研究质量仍待验收。
客户端交互网站现通过同一任务引擎使用固定模板，提供实际筛选、本地表单验证及独立隔离预览。
这不代表已连接服务器、表单发送或公开部署；现有静态网站功能保持不变。
现有自定义代理保留规划器和权限选择；仅完全匹配历史默认配置的未修改初始代理会升级默认能力。
交互网站结果现支持 GitHub Pages 精确文件确认发布、受保护凭据、持久回执、只读恢复和经确认的回滚。Windows 隔离测试已通过；实际仓库和最终安装包的验收仍待完成，不会自动发布现有网站。

Windows 指定应用的聚焦、最小化、恢复，以及 Spotify 播放暂停和明确输出音量命令，现使用本地类型化操作并确认实际状态。四种语言的原生窗口测试已通过；真实播放、音量更改和最终安装包仍待验收。

第 7 阶段（2026-09-30）：源码审查与助手架构方案已准备就绪，将按小步骤实施；这并不代表正式版本已完成。
请从 [Sol 交接说明](SOL_START_HERE.md)、[实施顺序](docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md)
和 [Windows 验收条件](docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md) 开始。
右下角安静的桌面伴侣仍是主要交互界面；NerdGPT 留待后续开发。

第六阶段账户检查点：设置页面已通过 Electron Main 接入可配置的 Google/邮箱登录、
受保护的会话及额度状态。持久化账本和仅提供账户功能的服务可在配置后运行。
真实托管登录尚未验收，托管模型/语音、首次试用及支付尚未接通。
参见[实现范围与后续条件](docs/roadmap/MORPHEUS_PHASE6_READINESS.md)
和[返回 PC 操作指南](docs/roadmap/MORPHEUS_PC_RETURN_2026-09-28.md)。

第五阶段源码检查点：提供商路由保持任务归属，Core 和语音请求记录可关联的用量结果。
本地评估与用量覆盖工具见[第五阶段协议](docs/roadmap/MORPHEUS_PHASE5_EVALUATION.md)。
模型质量对比、完整金额上限及 Windows 硬件验收仍待完成；离线测试不代表真实提供商表现。

第三阶段任务连续性：独立命令可在其他任务运行时执行，冲突的桌面和文件操作会排队。完整及紧凑界面支持任务选择、分别停止语音或任务、记住精确授权，以及保守的重启恢复。新用户默认使用 Balanced，现有偏好保留。参见[实现与验收边界](docs/architecture/MORPHEUS_TASK_CONTINUITY.md)。

Windows 桌面伴侣源码检查点（7A.1–7A.3）：本地唤醒显示光球而不抢占焦点。悬停会显示可编辑的向上输入框；点击后可在真正的文本框中输入。指针移开或按 Escape 会保留由 Main 管理的草稿。按 Enter 只提交一个关联的对话回合，普通回复留在紧凑对话中，不会自动跳转到 Chat。显式展开完整界面后，对话和草稿保持一致；显示器或工作区域变化时，光球仍锚定在右下角。全新构建的 Windows Electron 自动化已覆盖这些源码流程。安装包、实机硬件和真实提供商验收仍待完成。

第 7B.1 阶段的 Provider 凭证源码工作仍在进行。应用自行管理的 API Key 路径现将密文写入带版本号的 Electron `safeStorage` 文件，并仅在读取验证后清理相匹配的旧记录。合成测试覆盖存储与旧版适配层的中断、冲突及系统保护不可用情形；隔离的 Windows Electron 测试已验证同一用户重启后可解密合成密钥。静态 OpenClaw SecretRef 与启动前精确匹配恢复已通过源码测试。现有用户资料升级、安装包及真实 Provider 验收仍未验证；OpenClaw 自行管理的 OAuth 凭证不在此静态 Key 保护声明范围内。

第 7C.1 阶段的源码自动化覆盖本地唤醒加命令仅派发一次（不再调用第二次语音转写）、取消麦克风获取及本地化的设备断开恢复。六项新构建 Electron 语音流程使用合成事件/音频或缺失配置通过验证；真实麦克风识别、安装包及实时语音验收仍待完成。

> **1.1.0 生产级伴侣候选版：**加入电影感首次与回访问候、状态驱动的发光 Signal 和紧凑后台 Presence。
> 包含随麦克风音量变化的 Signal、所选语音试听、有界 MP3
> 自动检测说话结束、有界免唤醒追问、流式播放和可选的 Windows 本地名字检测。命令识别仍需转录提供商。真实麦克风和
> 语音验收尚未完成，不代表已达到公开发布标准。请参阅
> [伴侣里程碑](docs/roadmap/COMPANION-EXPERIENCE-MILESTONES.md)。

<p align="center">
  <strong>桌面 AI 执行平台与 AI 系统构建器</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#为什么选择-morpheus">为什么选择 Morpheus</a> •
  <a href="#快速上手">快速上手</a> •
  <a href="#系统架构">系统架构</a> •
  <a href="#开发指南">开发指南</a> •
  <a href="#参与贡献">参与贡献</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-MacOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/electron-40+-47848F?logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react" alt="React" />
  <a href="https://discord.com/invite/84Kex3GGAh" target="_blank">
  <img src="https://img.shields.io/discord/1399603591471435907?logo=discord&labelColor=%20%235462eb&logoColor=%20%23f5f5f5&color=%20%235462eb" alt="chat on Discord" />
  </a>
  <img src="https://img.shields.io/github/downloads/MoNaBOSS/Morpheus/total?color=%23027DEB" alt="Downloads" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文 | <a href="README.ja-JP.md">日本語</a> | <a href="README.ru-RU.md">Русский</a>
</p>

---

## 概述

**Morpheus** 将用户目标转换为类型化执行计划，评估其中的信任边界，执行确定性的系统能力，并通过实时状态、产物和只追加历史让整个过程保持可观察。聊天只是平台的一个入口，而不是产品本身。

[OpenClaw](https://github.com/OpenClaw) 继续作为内嵌的智能体与聊天运行时。Morpheus 拥有指挥中心、执行计划、权限、能力、工作流、调度、产物和审计历史。模型供应商是可替换的推理后端，永远不会直接获得不受限制的操作系统权限。

<p align="center"><strong style="font-size:1.1em; text-decoration: underline;">如需完整的企业版、专属服务支持或面向您业务场景的定制化落地辅导，请联系 <a href="mailto:public@valuecell.ai">public@valuecell.ai</a>。</strong></p>

---

## 截图预览

<p align="center">
  <img src="resources/screenshot/zh/chat.png" style="width: 100%; height: auto;">
</p>

<p align="center">
  <img src="resources/screenshot/zh/cron.png" style="width: 100%; height: auto;">
</p>

<p align="center">
  <img src="resources/screenshot/zh/skills.png" style="width: 100%; height: auto;">
</p>

<p align="center">
  <img src="resources/screenshot/zh/channels.png" style="width: 100%; height: auto;">
</p>

<p align="center">
  <img src="resources/screenshot/zh/models.png" style="width: 100%; height: auto;">
</p>

<p align="center">
  <img src="resources/screenshot/zh/settings.png" style="width: 100%; height: auto;">
</p>

---

## 为什么选择 Morpheus

构建 AI 智能体不应该需要精通命令行。Morpheus 的设计理念很简单：**强大的技术值得拥有一个尊重用户时间的界面。**

| 痛点 | Morpheus 解决方案 |
|------|----------------|
| 复杂的命令行配置 | 一键安装，配合引导式设置向导 |
| 手动编辑配置文件 | 可视化设置界面，实时校验 |
| 进程管理繁琐 | 自动管理网关生命周期 |
| 应用更新 | 在配置已签名的 Morpheus 更新端点前保持禁用 |
| 多 AI 供应商切换 | 统一的供应商配置面板 |
| 技能/插件安装复杂 | 内置技能市场与管理界面 |

### 内置 OpenClaw 核心

Morpheus 直接基于官方 **OpenClaw** 核心构建。无需单独安装，我们将运行时嵌入应用内部，提供开箱即用的无缝体验。

我们致力于与上游 OpenClaw 项目保持严格同步，确保你始终可以使用官方发布的最新功能、稳定性改进和生态兼容性。

---

## 功能特性

### 🎯 零配置门槛
从安装到第一次 AI 对话，全程通过直观的图形界面完成。无需终端命令，无需 YAML 文件，无需到处寻找环境变量。

### 💬 智能聊天界面
通过现代化的聊天体验与 AI 智能体交互。支持多会话上下文、消息历史记录，并以流式 Markdown 渲染智能体回复，支持带语法高亮的围栏代码块、面向中日韩文本的解析、GitHub 风格表格，以及由 KaTeX 渲染的 LaTeX 数学公式（`$行内$`、`$$块级$$`、`\(行内\)` 和 `\[块级\]`）；用户输入则始终按原始文本显示。同时支持在多 Agent 场景下通过主输入框中的 `@agent` 直接路由到目标智能体。围栏代码会保留源码换行、自动软换行，并在流式输出结束后提供本地化的复制操作。
从输入框插入的技能会以 `/技能名` 卡片形式显示；点击卡片可在右侧预览栏打开并阅读该技能的 `SKILL.md`。
当你使用 `@agent` 选择其他智能体时，Morpheus 会直接切换到该智能体自己的对话上下文，而不是经过默认智能体转发。各 Agent 工作区默认彼此分离，但更强的运行时隔离仍取决于 OpenClaw 的 sandbox 配置。
会话侧边栏现在以工作空间优先组织：默认工作空间固定在最上方，其它工作空间按自然顺序排列，每个工作空间都可折叠或继续加载更多会话。AI 回复期间，会话行显示加载指示器；未查看的回复完成后显示蓝点；打开会话后恢复显示相对活跃时间，悬停时仍会露出操作按钮。导入的工作空间可从侧边栏标题处重命名，新名称会同步显示在对话输入框下方，同时悬浮标题仍可查看文件系统路径。如果当前所选会话存在有效工作空间，新对话会继承该工作空间，并在首次发送前保持可编辑。对于可编辑的新对话或未绑定对话，输入框的工作空间卡片会打开一个小菜单，列出最近使用及现有会话中的工作空间，并可切回默认工作空间或选择其它目录。如果保存的工作空间文件夹已被移动或删除，Chat 会暂停创建会话并提示选择现有文件夹，而不会持续重试失效路径。不可用的非默认工作空间会在侧边栏显示标记，并可在确认后删除；该操作会永久删除分组中的全部会话。只有永久删除成功后，会话行才会移除且页面才会跳转；删除失败时会保留会话与确认框，方便重试。OpenClaw 生成的 UUID 加日期兜底标题只有在与该会话 ID 匹配时才会被视为缺失标题，随后改用会话的首条用户消息展示，而不会被持久化为会话名称。
每个 Agent 还可以单独覆盖自己的 `provider/model` 运行时设置；未覆盖的 Agent 会继续继承全局默认模型。

Chat 右侧面板的工作空间和预览选项卡支持以只读方式预览 Markdown、`.docx` 和 `.pptx` 文件。Markdown 文件预览以静态渲染模式提供相同的围栏代码语法高亮、软换行与复制操作、面向中日韩文本的解析和 KaTeX 数学公式支持。预览栏顶部可将当前文件展开至 Morpheus 的整个可视区域；再次点击该按钮或按 Esc 即可返回侧栏。旧版 `.doc` 和 `.ppt` 文件不会在应用内预览，而是继续通过操作系统打开。DOCX 的分页效果可能与 Microsoft Word 不同；PPTX 预览不支持动画、切换效果或媒体播放。超过 20 MB 的 Office 文件不会在应用内预览。

### 本地 HTML 预览
Chat 右侧面板只包含工作空间、预览和变更，不再提供通用网页浏览器、主页或地址栏。已授权的本地 `.html` 和 `.htm` 附件、文件活动及工作空间文件默认在预览中打开。文件操作可以选择 Morpheus 内置预览或系统应用，预览标题栏也可将当前 HTML 文件交给系统浏览器打开。

所有链接都不可点击。Morpheus 渲染的链接显示为普通文本，HTML 预览中的链接也会移除链接样式和指针交互。HTML 预览同时阻止表单、脚本跳转、重定向、页内跳转、弹窗、下载、网络请求和设备权限；它可以显示自包含的本地 HTML，但无法离开当前选中的文档。

配置模型供应商后，Morpheus Objective Core 还可以在已批准的 Morpheus 工作空间中创建受限的自包含商业网站项目，验证真实的响应式文件和可接入分析的配置，将验证后的入口作为可检查的指挥中心产物展示，并创建真实的 Morpheus 跟进提醒。除非受支持的部署能力实际成功，否则它不会声称网站已公开部署。

### 📡 多频道管理
同时配置和监控多个 AI 频道。每个频道独立运行，允许你为不同任务运行专门的智能体。
现在每个频道支持多个账号，并可在 Channels 页面直接完成账号绑定到 Agent 与默认账号切换。
对于自定义频道账号 ID，Morpheus 现在会强制校验 OpenClaw 兼容的规范格式（`[a-z0-9_-]`、小写、最长 64 位、且必须以字母或数字开头），避免路由匹配异常。
Morpheus 现在还内置了腾讯官方个人微信渠道插件，可直接在 Channels 页面通过内置二维码流程完成微信连接。

### ⏰ 定时任务自动化
调度 AI 任务自动执行。定义触发器、设置时间间隔，让 AI 智能体 7×24 小时不间断工作。
现在定时任务页面已经可以直接配置外部投递，统一拆成“发送账号”和“接收目标”两个下拉选择。对于已支持的通道，接收目标会从通道目录能力或已知会话历史中自动发现，不需要再手动修改 `jobs.json`。任务的消息输入框也支持像主对话框那样以内联 `/skill` 令牌的方式插入技能（按所选智能体范围加载），让定时提示词可以直接触发技能。调度选择器现在分为**周期**和**单次**两个选项卡：周期支持每小时、每天、工作日、每周、自定义（原始 cron）等频率，并内置时间/星期选择；单次则在所选日期（显示星期）和时间执行一次。单次任务必须设置为未来时间，并会在执行完成后由运行时自动清除。


### 🧩 可扩展技能系统
通过预构建的技能扩展 AI 智能体的能力。集成的 Skills 页面采用“本地优先”方式：会扫描托管目录与 workspace 技能目录，并且无需依赖 Gateway 即可启用或停用技能；在企业扩展接管时，也可以显示扩展提供的 marketplace。
Morpheus 还会内置预装完整的文档处理技能（`pdf`、`xlsx`、`docx`、`pptx`），在启动时自动部署到托管技能目录（默认 `~/.openclaw/skills`），并在首次安装时默认启用。
Skills 页面可展示来自多个 OpenClaw 来源的技能（托管目录、workspace、额外技能目录），并显示每个技能的实际路径，便于直接打开真实安装位置。对于 OpenClaw 自带的 bundled skills，社区版现在在打包产物里只保留并展示 `skill-creator`；开发模式和打包版启动时都会直接清理其它 bundled skill，同时把这些已删除 bundled skill 在 `openclaw.json` 中残留的旧配置一并移除。

### 🔐 安全的供应商集成
可连接多个 AI 供应商（OpenAI、Anthropic、Z.AI / GLM 等）。第 7B.1 阶段的源码实现将应用自行管理的 API Key 存入经 Electron `safeStorage` 加密的文件；若系统保护不可用，则拒绝退回明文存储。这不表示密钥可跨设备移植，也不表示 OpenClaw 管理的 OAuth Token 与所有运行时凭证副本均已加密。OpenAI 同时支持 API Key 与浏览器 OAuth（Codex 订阅）登录。
在开发者模式下，独立的“图像生成”页面支持配置 OpenAI 兼容生图端点（Base URL、API Key 和模型名，例如 `gpt-image-2`），生图请求会走专用的 `/v1/images/generations` 服务，聊天仍继续使用正常的 OpenAI Provider。
如果你通过 **自定义（Custom）Provider** 对接 OpenAI-compatible 网关，可以在 **设置 → AI Providers → 编辑 Provider** 中配置自定义 `User-Agent`，以提高兼容性。
编辑或切换 Provider 时，Morpheus 会保留已有的模型级能力元数据，例如 `input: ["text", "image"]`。新选择的自定义 Provider 模型会使用与 OpenClaw onboarding 一致的图片输入能力推断；未知模型默认按纯文本模型处理。
自定义 Provider 的模型行还会写入显式的 `contextWindow`（按模型系列推断，例如 `gpt-5.x` → 272k），旧版本保存的模型行会在启动时自动回填，使 OpenClaw 能在长会话超限前主动压缩上下文，避免出现 "Context overflow" 报错。当你没有配置 compaction 时，Morpheus 会默认写入 `agents.defaults.compaction.mode = "safeguard"` 和 `reserveTokensFloor = 50000`；你手动配置过的模型行或压缩配置永远不会被修改（仅可能回填缺失的 `reserveTokensFloor`）。
Z.AI（国内站 / 国际站）会映射到 OpenClaw 内置的 `zai` 供应商（`ZAI_API_KEY`），默认模型为 `glm-5.2`。可通过 Code Plan 预设切换到编码套餐端点（`…/api/coding/paas/v4`），或使用普通 API 端点（`…/api/paas/v4`）；国内站与国际站互斥，因为它们共享同一个 OpenClaw 运行时 key。
如果兼容网关的 `/models` 因非鉴权原因不可用，Morpheus 会在校验 API Key 时使用已配置的模型，自动降级为轻量的 `/chat/completions` 或 `/responses` 探测。

### 🌙 自适应主题
支持浅色模式、深色模式或跟随系统主题。Morpheus 自动适应你的偏好设置。

### 🚀 开机启动控制
在 **设置 → 通用** 中，你可以开启 **开机自动启动**，让 Morpheus 在系统登录后自动启动。

### 🔔 更新提示
Morpheus 当前会如实显示“未配置更新”。应用不会访问或安装继承自 ClawX 的更新源；只有显式配置已签名的 Morpheus 更新端点后才会启用更新检查。

---

### 🟢 Morpheus Windows 1.0 生产伴侣

当前源码默认打开简洁的对话工作区，显示已选定的 Morpheus 光球、克制的 Matrix 数字雨、
真实任务记录以及按需出现的结果面板。进行中的任务和高级功能仍可访问，
但不会占据日常主界面。旧安装包尚不包含这次工作区更新。

1.0.3 候选版本明确显示神经语音错误，保存失败时保留原语音设置，CI 打包前运行完整单元测试和重点 Electron 测试。
发布流程仅创建草稿，并要求明确配置 Morpheus 签名。候选版本不等于已批准公开发布。

1.0.2 为规划请求和输出设置上限，记录不含内容的用量元数据，并在主进程取消语音请求。
语音回复保持简短，完整结果仍在任务中显示。主动开启的后台监听不再依赖动画帧。
这些限制不是金额保证，也不涵盖独立的 OpenClaw 聊天请求；没有新增定价页面。

1.0.1 更新在启动后欢迎老用户，并提供「打开工作区」或「留在系统托盘」。
指挥中心的「伙伴」可重新打开欢迎界面。移入托盘不会自动开启麦克风。
激活的最后一屏等待用户选择；停止语音也会阻止延迟返回的音频播放。
动画遵循系统的减少动态效果设置。

Morpheus 默认打开 `/` 的**工作区**；`Ctrl+Shift+Space` 可从任何位置调用**快捷命令**；
**语音命令**拥有独立全局快捷键；OpenClaw 聊天在 `/chat` 保持可用。主进程自动把问题路由到 OpenClaw，把明确的结果请求路由到同一 Objective Core；不清楚的指令只请求一次聚焦说明。日常界面不再显示「询问 / 自动 / 执行」选择器，目标解析与执行权限仍由主进程掌控。

伴侣与 Mission 基础进一步把运行时扩展为可持续的操作体验：

- 一次性、可跳过的电影化激活流程只展示真实的能力、Gateway、供应商和语音可用状态，并设置称呼、个性、操作模式、自主级别、开机驻留、已披露唤醒词、语音结果与主动问候；
- 托盘与全局快捷键会召唤专注的伴侣界面，关闭或展开时精确恢复用户原来的窗口状态；
- 每个已接受目标都会成为持久 **Mission**，保存路由、运行谱系、状态、结果、错误和真实产物，并可跨重启查看；
- **Projects & Context** 将目标绑定到逻辑受信任工作区和可检查、由用户管理的记忆；敏感或仅本地记忆不会进入供应商规划上下文；
- 已知目标会先直接路由到已注册能力，复杂目标仍进入同一供应商中立 Objective Core。语音、快捷命令、指挥中心、工作流、调度和 Chat 执行不会形成相互独立的自动化路径。
- 可选环境语音只在明确披露后启用，要求精确唤醒词、始终显示可观察状态，并进入同一 Objective Core；
- **Today** 从真实 Mission、Goal、调度和重复工作生成关注项，支持持久化的忽略、稍后提醒与受限主动通知；
- 长期 **Goals** 保存可衡量里程碑和精确执行上下文；**Systems** 将已审查工作流或合格 Mission 转为经过真实测试的可复用系统，但不会创建权限授权；
- 首次伴侣激活只在真实状态就绪后显示 **MORPHEUS IS READY**，并介绍指挥中心、全局快捷命令与语音入口。
- 激活流程和指挥中心仅在账号协议兼容且凭证已配置时显示 Objective Core 就绪；缺少配置会直接进入模型设置。语音不清时只自然地请求重说一次，配置错误则提供同一设置入口。

- **多步骤类型化计划** —— 依赖、状态、结果、错误和产物均来自真实的顺序执行；失败只跳过其传递依赖项。
- **供应商驱动的 Objective Core** —— 已配置供应商可通过类型化、模式校验的边界进行目标理解、计划审查与重新规划。供应商输出始终是不可信输入，不会获得直接系统权限；确定性规划保留为真实回退。
- **计划级信任评估** —— Strict、Balanced 和 Autonomous（全新私测配置的默认值）会评估完整计划，只为真正新增的范围询问一次，
  并复用精确的会话或持久授权。关键风险不可绕过，审计降级时会阻止写入与进程启动。
- **19 项受控 Windows 能力** —— 文件与文件夹、已批准应用、独立的剪贴板读写范围、通知、可授权截图、
  系统/存储/进程信息、已批准 URL 和受限的 VS Code 项目启动。没有通用 Shell、PowerShell、任意可执行文件或路径。
- **AI 系统构建器** —— 可编辑且感知提供方的 Agent Profiles、主进程验证的类型化工作流、绑定工作区的 Morpheus 调度，以及供应商中立的规划接口。定义只能收窄权限，不能创建授权。
- **受信任工作区** —— 通过原生文件夹选择器注册精确规范根目录，支持只读/读写策略和逻辑选择；删除、停用或降级根目录时立即撤销其授权。
- **真实可观察性** —— 主进程实时事件、从隐私安全审计元数据重建的持久产物，以及跨日只追加 Activity 历史。
- **Signal OS 视觉系统** —— 默认深色，在 1280×800 下保持紧凑；Matrix 风格仅用于真实的实时/已验证状态，配有原创 Morpheus 信号语法、电影化首次激活、以执行为中心的 Mission 舞台和紧凑 Presence/Invoke 界面。不使用任何演员肖像。
- **Windows 原生操作体验** —— 托盘展示真实 Gateway 状态、运行暂停/恢复、权限配置、快捷命令与语音命令。语音转写仅使用已配置的兼容供应商，朗读使用 Windows 语音服务，凭证不会暴露给渲染器。

操作策略、授权、调度、目标解析、执行和审计持久化均由 Electron 主进程拥有。详见
[`docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md`](docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md)
与 [`docs/security/PERMISSION_MODEL.md`](docs/security/PERMISSION_MODEL.md)。

---

## 快速上手

### 系统要求

- **操作系统**：macOS 11+、Windows 10+ 或 Linux（Ubuntu 20.04+）
- **内存**：最低 4GB RAM（推荐 8GB）
- **存储空间**：1GB 可用磁盘空间

### 安装方式

#### 预构建版本（推荐）

从 [Morpheus Releases](https://github.com/MoNaBOSS/Morpheus/releases) 页面下载适用于你平台的最新版本。

#### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/MoNaBOSS/Morpheus.git morpheus-core
cd morpheus-core

# 初始化项目
pnpm run init

# 以开发模式启动
pnpm dev
```
### 首次启动

首次启动 Morpheus 时，**设置向导** 将引导你完成以下步骤：

1. **语言与区域** – 配置你的首选语言和地区
2. **AI 供应商** – 通过 API 密钥或 OAuth（支持浏览器/设备登录的供应商）添加账号
3. **技能包** – 选择适用于常见场景的预配置技能
4. **验证** – 在进入主界面前测试你的配置

如果系统语言在支持列表中，向导会默认选中该语言；否则回退到英文。

> Moonshot（Kimi）说明：Morpheus 默认保持开启 Kimi 的 web search。
> 当配置 Moonshot 后，Morpheus 也会将 OpenClaw 配置中的 Kimi web search 同步到中国区端点（`https://api.moonshot.cn/v1`）。

### 代理设置

Morpheus 内置了代理设置，适用于需要通过本地代理客户端访问外网的场景，包括 Electron 本身、OpenClaw Gateway，以及 Telegram 这类频道的联网请求。

打开 **设置 → 网关 → 代理**，配置以下内容：

- **代理服务器**：所有请求默认使用的代理
- **绕过规则**：需要直连的主机，使用分号、逗号或换行分隔
- 在 **开发者模式** 下，还可以单独覆盖：
  - **HTTP 代理**
  - **HTTPS 代理**
  - **ALL_PROXY / SOCKS**

本地代理的常见填写示例：

```text
代理服务器: http://127.0.0.1:7890
```
说明：

- 只填写 `host:port` 时，会按 HTTP 代理处理。
- 高级代理项留空时，会自动回退到“代理服务器”。
- 保存代理设置后，Electron 网络层会立即重新应用代理，并自动重启 Gateway。
- 如果启用了 Telegram，Morpheus 还会把代理同步到 OpenClaw 的 Telegram 频道配置中。
- 当 Morpheus 代理处于关闭状态时，Gateway 的常规重启会保留已有的 Telegram 频道代理配置。
- 如果你要明确清空 OpenClaw 中的 Telegram 代理，请在关闭代理后点一次“保存代理设置”。
- 在 **设置 → 高级 → 开发者** 中，可以直接运行 **OpenClaw Doctor**，执行 `openclaw doctor --json` 并在应用内查看诊断输出。
- 在 Windows 打包版本中，内置的 `openclaw` CLI/TUI 会通过随包分发的 `node.exe` 入口运行，以保证终端输入行为稳定。

---

## 系统架构

Morpheus 采用 **双进程 + Host API 统一接入架构**。渲染进程只调用统一客户端抽象，协议选择与进程生命周期由 Electron 主进程统一管理：

OpenClaw 配置交付也统一由 Electron Main 管理。Gateway 运行时，Morpheus 以 `config.get` 返回的权威快照为基线，并通过 `config.set` 提交修改；Gateway 停止或启动中时，同一个协调器只更新解析后的 JSON5 配置文件，不会因此启动 Gateway。仅修改配置的 Provider、Agent、Channel、绑定、Skill 和模型操作不会替换 Gateway 进程。第 7B.1 阶段的源码路径中，新增或替换应用自行管理的静态 API Key 需要重启由本应用启动的 Gateway，以更新进程环境中的 SecretRef 值；应用不会重启外部管理的 Gateway，后者需另行刷新。代理等进程启动环境变化、用户显式操作以及健康检查或崩溃恢复也可能触发重启。上游 OAuth 认证配置写入 SQLite 后，OpenClaw 的 `secrets.reload` 可让运行中的 Agent 无需重启进程即可读取新凭据。

Chat 使用由 Electron Main 持有的 ACP stdio bridge。Renderer 接收类型化 host events，并渲染内存中的 ACP timeline。Gateway 仍负责 providers、models、skills、workspace、settings、diagnostics 和 media configuration 等非 Chat 能力。

打开其它会话或页面时，尚未完成的 ACP 回复仍会继续流式接收。若在回复完成前返回，Morpheus 会恢复最新的内存 timeline 并继续显示实时输出；回复完成后，普通 ACP 历史回放仍是唯一事实来源。

ACP assistant 回合会显示整轮耗时。Live 计时跟随客户端观测到的 prompt 生命周期，并在应用内导航后保持连续；历史耗时由 Electron Main 根据有界的 OpenClaw transcript 时间戳计算，而且只能标注 ACP 回放已经恢复出的回合。

ACP Chat 会将标准 ACP resource 渲染为附件。用户选择的图片会显示为缩略图，并在悬停蒙层中显示文件名；其它可用的附件卡片会显示文件名，以及灰色、可截断的来源路径。当前 OpenClaw ACP adapter 遗漏 assistant 媒体时，OpenClaw 持久化的规范媒体事实和显式 assistant `MEDIA:` 指令也可恢复为附件卡片，且不会显示仅用于 transcript 的元数据。现有本地文件引用（包括当前 workspace 外的路径）在每次预览或打开前，都会由 Electron Main 按精确的 session 和 generation 重新验证。AI 生成且可预览的本地附件（包括不超过 20 MB 的 `.docx` 和 `.pptx` 文件）会保留主要的只读应用内预览操作，并提供次级菜单，可通过兼容应用打开，或在 Finder、文件资源管理器或系统文件管理器中显示。对于本地 HTML 附件，该菜单第一项会在右侧预览中打开文件。Office 预览在此处也有相同限制：`.doc` 和 `.ppt` 仍通过系统应用打开，DOCX 的分页效果可能与 Microsoft Word 不同，PPTX 的动画、切换效果和媒体播放不受支持。兼容应用发现仅在 macOS 和 Windows 上可用；在 Linux 上或发现失败时，会静默降级为仅显示文件位置。其它本地文件（包括超过 20 MB 的 Office 文件）会在用户点击后通过系统应用打开。用户选择的文件夹附件在发送后也会保持可用，点击后交给系统文件管理器打开；Morpheus 不会读取或预览其中内容。远程 HTTP 和 HTTPS 附件会在用户点击后从外部打开。没有规范媒体事实佐证的普通文本裸路径或行内路径不会被当作附件。

ACP Chat 也可在 runtime 以可信结构化媒体投递图像生成结果时显示生成图片预览。对于可信的 OpenClaw internal-UI 投递和与生图任务关联的最终回复，Morpheus 会保留原始的用户可见完成文案，包括只有文本的失败说明，而不会统一替换成通用图片文案。历史 OpenClaw 回放中，assistant 的图片 `MEDIA:` 标记只有在同一会话已记录图像生成任务启动后才会进入内联图片体验。Morpheus 通过 Electron Main 的主机媒体处理加载预览，而不是让 Renderer 任意访问文件系统。标准 ACP 图片和 resource 内容仍是首选路径，并会直接渲染。

### ACP 文件活动语义

- 文件活动由成功且已完成的 OpenClaw `write`、`edit` 和 `apply_patch` 调用投影而来。工具识别方式与 OpenClaw 官方 Chat UI 保持一致；仅接收已完成调用的筛选规则是 Morpheus 特有的。
- 已创建和已修改的活动行与可预览的 assistant 附件共用同一种文件卡片外壳和**打开方式**菜单，同时保留状态文字及可用的 `+/-` 统计。对于 HTML 文件，菜单第一项会在右侧**预览**中打开文件；已删除的活动行只保留 **Changes** 操作。应用列表、指定应用打开和显示文件位置都会由 Electron Main 根据 workspace 根目录与相对路径分别重新验证；工具路径不会因此变成附件，Renderer 也不会获得规范化系统路径。
- `write` 按工具声明的语义显示：视为创建，并展示为全部新增的差异，即使该路径可能已经存在。
- **Changes** 是按时间顺序记录工具声明活动的会话级记录，不是 Git 输出，也不是相对于已验证源码基线的差异。
- 对每个文件，Changes 在每轮助手回复中最多展示一个 diff 编辑器。可安全串联的片段会合并，独立片段会拼接到同一个编辑器中，但不会被描述为基于完整文件基线的差异。
- Shell 命令、脚本、用户或 IDE 产生的副作用不会被检测。
- 完整的 ACP 回放可以恢复已记录的文件活动；如果回放不完整，Morpheus 不会通过回退推断来补造缺失活动。

```
┌───────────────────────────────────────────────────────────────────┐
│                        Morpheus 桌面应用                              │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              Electron 主进程                                 │  │
│  │  • 窗口与应用生命周期管理                                       │  │
│  │  • 网关进程监控                                               │  │
│  │  • 系统集成（托盘、通知、密钥链）                                │  │
│  │  • Morpheus 更新策略（当前未配置）                              │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                              │ IPC (权威控制面)                     │
│                              ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              React 渲染进程                                  │  │
│  │  • 现代组件化 UI（React 19）                                  │  │
│  │  • Zustand 状态管理                                          │  │
│  │  • 统一 host-api/api-client 调用                             │  │
│  │  • 回复使用 Markdown，用户输入按原文显示                         │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               │ 类型化 IPC 请求
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  主进程 Host Services 与 Gateway Manager          │
│                                                                 │
│  • host:invoke 类型化服务分发                                      │
│  • 设置、文件、会话、技能、供应商、诊断服务                           │
│  • 主进程持有 Gateway WebSocket 并负责进程监控                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ 主进程持有 WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw 网关                                │
│                                                                 │
│  • AI 智能体运行时与编排                                           │
│  • 消息频道管理                                                   │
│  • 技能/插件执行环境                                               │
│  • 供应商抽象层                                                   │
└─────────────────────────────────────────────────────────────────┘
```
### 设计原则

- **进程隔离**：AI 运行时在独立进程中运行，确保即使在高负载计算期间 UI 也能保持响应
- **前端调用单一入口**：渲染层统一走 host-api/api-client，不感知底层协议细节
- **主进程掌控传输策略**：ACP Chat stdio bridge 与 Gateway 传输都由 Electron Main 持有，渲染进程通过类型化 IPC 调用 Main
- **扩展 IPC 贡献点**：主进程扩展通过类型化 IPC 注册表贡献 host-api action，而不是挂载 HTTP route
- **优雅恢复**：内置重连、超时、退避逻辑，自动处理瞬时故障
- **安全存储**：API 密钥和敏感数据利用操作系统原生的安全存储机制
- **CORS 安全**：渲染进程不直接请求本地 Gateway 或 Host API HTTP 端点

### 进程模型与 Gateway 排障

- Morpheus 基于 Electron，**单个应用实例出现多个系统进程是正常现象**（main/renderer/zygote/utility）。
- 单实例保护同时使用 Electron 自带锁与本地进程文件锁回退机制，可在桌面会话总线异常时避免重复启动。
- 滚动升级期间若新旧版本混跑，单实例保护仍可能出现不对称行为。为保证稳定性，建议桌面客户端尽量统一升级到同一版本。
- 但 OpenClaw Gateway 监听应始终保持**单实例**：`127.0.0.1:18789` 只能有一个监听者。
- Gateway readiness 以 OpenClaw 的 `system-presence`、`health`、`status` 等核心信号为准；memory 或频道失败会显示为能力降级，而不是全局 Gateway 故障。
- 可用以下命令确认监听进程：
  - macOS/Linux：`lsof -nP -iTCP:18789 -sTCP:LISTEN`
  - Windows（PowerShell）：`Get-NetTCPConnection -LocalPort 18789 -State Listen`
- 点击窗口关闭按钮（`X`）默认只是最小化到托盘，并不会完全退出应用。请在托盘菜单中选择 **Quit Morpheus** 执行完整退出。

---

## 使用场景

### 🤖 个人 AI 助手
配置一个通用 AI 智能体，可以回答问题、撰写邮件、总结文档并协助处理日常任务——全部通过简洁的桌面界面完成。

### 📊 自动化监控
设置定时智能体来监控新闻动态、追踪价格变动或监听特定事件。结果将推送到你偏好的通知渠道。

### 💻 开发者效率工具
将 AI 融入你的开发工作流。使用智能体进行代码审查、生成文档或自动化重复性编码任务。

### 🔄 工作流自动化
将多个技能串联起来，创建复杂的自动化流水线。处理数据、转换内容、触发操作——全部通过可视化方式编排。

---

## 开发指南

### 前置要求

- **Node.js**：对应主版本范围内的 22.22.3+、24.15.0+ 或 25.9.0+（推荐 Node 24 LTS）
- **包管理器**：pnpm 9+（推荐）或 npm
- **Linux（Ubuntu/Debian）**：运行 Electron 前，请先安装所需系统库：
  ```bash
  sudo apt-get install -y libnss3 libgtk-3-0 libxss1 libxtst6 libatspi2.0-0 libnotify4 xdg-utils
  ```
  在 Ubuntu 24.04+ 上，部分软件包使用 `t64` 后缀，运行上述命令后 `apt` 会自动选择正确版本。

### 项目结构

```Morpheus/
├── electron/                 # Electron 主进程
│   ├── services/            # 类型化 Host API、Provider、Secrets 与运行时服务
│   │   ├── providers/       # Provider/account 模型同步逻辑
│   │   └── secrets/         # 受 Electron safeStorage 保护的应用凭证
│   ├── shared/              # 共享 Provider schema/常量
│   │   └── providers/
│   ├── main/                # 应用入口、窗口、IPC 注册
│   ├── gateway/             # OpenClaw 网关进程管理
│   ├── preload/             # 安全 IPC 桥接
│   └── utils/               # 工具模块（存储、认证、路径）
├── src/                      # React 渲染进程
│   ├── lib/                 # 前端统一 API 与错误模型
│   ├── stores/              # Zustand 状态仓库（settings/chat/gateway）
│   ├── components/          # 可复用 UI 组件
│   ├── pages/               # Setup/Dashboard/Chat/Channels/Skills/Cron/Settings
│   ├── i18n/                # 国际化资源
│   └── types/               # TypeScript 类型定义
├── tests/
│   ├── e2e/                 # Playwright Electron 端到端冒烟测试
│   └── unit/                # Vitest 单元/集成型测试
├── resources/                # 静态资源（图标、图片）
└── scripts/                  # 构建与工具脚本
```
### 常用命令

```bash
# 开发
pnpm run init             # 安装依赖并下载捆绑二进制（uv、agent-browser）
pnpm dev                  # 以热重载模式启动（若缺失会自动准备预装技能包）

# 代码质量
pnpm lint                 # 运行 ESLint 检查
pnpm typecheck            # TypeScript 类型检查

# 测试
pnpm test                 # 运行单元测试
pnpm run test:e2e         # 运行 Electron E2E 冒烟测试
pnpm run test:e2e:headed  # 以可见窗口运行 Electron E2E 测试
pnpm run perf:chat        # 采集合成 Chat 场景的 Renderer/Main CPU Profile
pnpm run profile:main     # 启动构建产物并在 9229 端口调试 Main
pnpm run comms:replay     # 计算通信回放指标
pnpm run comms:baseline   # 刷新通信基线快照
pnpm run comms:compare    # 将回放指标与基线阈值对比

# 构建与打包
pnpm run build:vite       # 仅构建前端
pnpm build                # 完整生产构建（含打包资源）
pnpm package              # 为当前平台打包（包含预装技能资源）
pnpm package:mac          # 为 macOS 打包
pnpm package:win          # 为 Windows 打包
pnpm package:linux        # 为 Linux 打包
```

在无头 Linux 环境下，Electron 测试需要显示服务；可使用 `xvfb-run -a pnpm run test:e2e`。

### Electron 性能诊断

`pnpm run perf:chat` 会运行隔离的合成 ACP 负载，分别覆盖流式响应，以及富 Markdown 静态会话中的侧栏和滚动交互，并在 Playwright 的 `test-results/` 目录输出版本化指标与 Renderer/Main CPU Profile。Renderer Profile 覆盖生产 store/render 路径和帧节奏；流式 Main Profile 测量 Main 到 Renderer 的 IPC fanout，交互 Main Profile 用于确认 Renderer 交互期间 Main 是否保持空闲。两者都不包含上游 OpenClaw/ACP 子进程或 GPU 进程路径。CPU Profile 可直接用 Chrome DevTools 打开；其中只包含生成的测试文本，不会上报为产品遥测。性能数据依赖硬件，应在同一机器上多次运行后对比，不应使用统一的跨平台绝对阈值。

录制真实 Renderer 时，使用 `CLAWX_REMOTE_DEBUGGING_PORT=9223 pnpm dev` 启动开发环境，再让 Playwright 或 Chrome DevTools 连接 `localhost:9223`。录制真实 Electron Main 时，运行 `pnpm run profile:main`，在 `chrome://inspect` 中配置 `localhost:9229` 并选择 Electron Main target。除非正在测量 WebSocket trace 本身，否则不要设置 `CLAWX_GATEWAY_WS_TRACE`。

Morpheus 默认保留 Chromium 硬件加速，使长文档、滚动和布局动画能够使用 GPU 合成与光栅化。若某台机器的显卡驱动存在问题，仍可使用 Chromium 原生的 `--disable-gpu` 命令行参数作为排障回退。

### 通信回归检查

当 PR 涉及通信链路（Gateway 事件、ACP Chat bridge 收发流程、Channel 投递、传输回退）时，建议执行：

```bash
pnpm run comms:replay
pnpm run comms:compare
```

CI 中的 `comms-regression` 会校验必选场景与阈值。
### 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Electron 40+ |
| UI 框架 | React 19 + TypeScript |
| 样式 | Tailwind CSS + shadcn/ui |
| 状态管理 | Zustand |
| 构建工具 | Vite + electron-builder |
| 测试 | Vitest + Playwright |
| 动画 | Framer Motion |
| 图标 | Lucide React |

---

## 参与贡献

我们欢迎社区的各种贡献！无论是修复 Bug、开发新功能、改进文档还是翻译——每一份贡献都让 Morpheus 变得更好。

### 如何贡献

1. **Fork** 本仓库
2. **创建** 功能分支（`git checkout -b feature/amazing-feature`）
3. **提交** 清晰描述的变更
4. **推送** 到你的分支
5. **创建** Pull Request

### 贡献规范

- 遵循现有代码风格（ESLint + Prettier）
- 为新功能编写测试
- 按需更新文档
- 保持提交原子化且描述清晰

---

## 致谢

Morpheus 构建于以下优秀的开源项目之上：

- [OpenClaw](https://github.com/OpenClaw) – AI 智能体运行时
- [Electron](https://www.electronjs.org/) – 跨平台桌面框架
- [React](https://react.dev/) – UI 组件库
- [shadcn/ui](https://ui.shadcn.com/) – 精美设计的组件库
- [Zustand](https://github.com/pmndrs/zustand) – 轻量级状态管理

---

## 社区

加入我们的社区，与其他用户交流、获取帮助、分享你的使用体验。

| 企业微信 | 飞书群组 | Discord |
| :---: | :---: | :---: |
| <img src="src/assets/community/wecom-qr.png" width="150" alt="企业微信二维码" /> | <img src="src/assets/community/feishu-qr.png" width="150" alt="飞书二维码" /> | <img src="src/assets/community/20260212-185822.png" width="150" alt="Discord 二维码" /> |

### Morpheus 合作伙伴计划 🚀

我们正在启动 Morpheus 合作伙伴计划，寻找能够帮助我们将 Morpheus 介绍给更多客户的合作伙伴，尤其是那些有定制化 AI 智能体或自动化需求的客户。

合作伙伴负责帮助我们连接潜在用户和项目，Morpheus 团队则提供完整的技术支持、定制开发与集成服务。

如果你服务的客户对 AI 工具或自动化方案感兴趣，欢迎与我们合作。

欢迎私信我们，或发送邮件至 [public@valuecell.ai](mailto:public@valuecell.ai) 了解更多。

---

## Stars 历史

<p align="center">
  <img src="https://api.star-history.com/svg?repos=MoNaBOSS/Morpheus&type=Date" alt="Stars 历史图表" />
</p>

---

## 许可证

Morpheus 基于 [MIT 许可证](LICENSE) 发布。你可以自由地使用、修改和分发本软件。

---

<p align="center">
  <sub>由 ValueCell 团队用 ❤️ 打造</sub>
</p>
