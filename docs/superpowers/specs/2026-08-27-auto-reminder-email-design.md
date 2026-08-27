# 自动邮件提醒网站 — 设计文档

- 日期：2026-08-27
- 状态：已确认

## 1. 项目目标

搭建一个网站，用户可自行添加提醒任务（每天/每周/每月/单次），由后端按计划时间自动向固定收件人发送邮件。全程强调安全，防止 SQL 注入等攻击。

## 2. 技术栈

- **后端**：Node.js + Express
- **数据库**：MySQL 8（mysql2 驱动）
- **调度**：node-cron（每分钟扫描到期任务）
- **发信**：nodemailer（SMTP，兼容 163 / QQ / 任意 SMTP 服务商）
- **前端**：原生 HTML/CSS/JS，由 Express 静态托管，无构建步骤
- **部署**：Docker Compose 一键部署（MySQL + 应用两个容器，`restart: always`）

## 3. 整体架构

- 单体服务：Express 同时提供 API 与静态页面
- 调度器：node-cron 每分钟触发，查询 `next_run_at <= 当前时间` 且启用的任务，逐条发送并更新下次运行时间
- 服务启动时：为所有启用的任务补算 `next_run_at`，防止漏发/重复
- 发送结果写入 `send_logs`，失败原因记录可追溯

## 4. 数据模型

### admin（管理员）
| 字段 | 说明 |
|------|------|
| id | 主键 |
| username | 用户名 |
| password_hash | bcrypt 密码哈希 |
| created_at | 创建时间 |

### reminders（提醒任务）
| 字段 | 说明 |
|------|------|
| id | 主键 |
| title | 标题（必填，限长） |
| content | 提醒内容（必填，限长） |
| type | 类型：one_time / daily / weekly / monthly |
| trigger_time | 触发时间：单次为完整时间戳；周期为 HH:mm |
| weekday | 每周类型时的星期（0-6） |
| day_of_month | 每月类型时的日期（1-31） |
| enabled | 是否启用 |
| next_run_at | 下次运行时间 |
| created_at / updated_at | 时间戳 |

### send_logs（发送记录）
| 字段 | 说明 |
|------|------|
| id | 主键 |
| reminder_id | 关联任务 |
| sent_at | 发送时间 |
| status | success / failed |
| error | 失败原因（脱敏） |

### settings（系统设置，单行）
| 字段 | 说明 |
|------|------|
| smtp_host | SMTP 服务器（163/QQ 等） |
| smtp_port | 端口 |
| smtp_user | 发件邮箱账号 |
| smtp_pass_encrypted | 授权码（AES-256 加密存储） |
| sender_name | 发件人名称 |
| recipient_email | 固定收件邮箱 |
| updated_at | 更新时间 |

## 5. 安全设计

| 威胁 | 防护措施 |
|------|---------|
| SQL 注入 | 全部使用 mysql2 预编译参数化查询（`?` 占位符），禁止字符串拼接 SQL |
| 未授权访问 | 管理员账号 + bcrypt 加盐密码 + 会话鉴权（cookie 设 httpOnly/Secure/SameSite），除登录外的所有 API 均校验会话 |
| 暴力破解 | 登录接口限流与失败锁定（express-rate-limit + 失败次数延迟） |
| CSRF | 校验自定义请求头 / 双重提交 token |
| 输入校验 | express-validator 校验所有入参：时间格式、邮箱格式、长度、类型白名单 |
| SMTP 授权码泄露 | AES-256-GCM 加密后落库，密钥来自服务器环境变量；日志与错误信息脱敏，不回显明文 |
| 通用加固 | Helmet 安全头、隐藏 X-Powered-By、生产模式关闭堆栈回显、数据库使用最小权限账号 |

## 6. 页面设计

简洁现代风格，中文界面，移动端适配（遵循用户偏好：无横向滚动、容器尺寸克制、提示框 5 秒）。

- **登录页**：单管理员登录
- **提醒管理页**：任务列表（标题/类型/时间/状态）+ 新建/编辑弹窗 + 启用/停用/删除/立即测试发送
- **发送日志页**：按任务查看发送历史与失败原因
- **系统设置页**：SMTP 配置（163/QQ）、收件邮箱、发件人名称、"发送测试邮件"按钮

## 7. 部署

- 项目根目录提供 `docker-compose.yml` 与 `Dockerfile`
- 服务器上仅需：`docker compose up -d`（含 MySQL 初始化建库建表）
- 容器配置 `restart: always`：服务器重启 / 进程崩溃自动拉起
- 环境变量管理：AES 密钥、数据库账号密码、管理员初始密码
- 本地开发可直接 `node server.js` 运行，不依赖 Docker
