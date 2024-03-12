# koishi-plugin-ohmygpt-api-chat

[![npm](https://img.shields.io/npm/v/koishi-plugin-ohmygpt-api-chat?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-ohmygpt-api-chat)

# 🎈 介绍

- 调用 OhMyGPT 官方 API 的聊天插件，提供房间与预设管理系统，暂时只对 Claude AI 有需求，所以没有其他模型。

## 🎐 功能特性

- 多房间支持，可以同时存在多个对话房间
- 支持私有房间和公开房间
- 预设管理，可以添加、修改、删除和查看预设
- 聊天记录管理，可以查看、修改、删除房间对话记录
- 权限控制，只有房主可以管理房间
- 文字转图片支持（可选）

## 🪄 安装

您可以在 Koishi 插件市场中搜索并安装本插件。

## 😺 使用

1. 请前往 [OhMyGPT 官网](https://www.ohmygpt.com?aff=xr26JIUD) 获取 OhMyGPT 的 API 密钥。
2. 为指令取合适的别名，启用该插件。

## 📚 命令列表

- `OhMyGPTChat.预设.添加/修改/删除/查看`：预设管理系统。
- `OhMyGPTChat.房间.聊天记录.查看/修改/删除`：房间聊天记录管理系统。
- `OhMyGPTChat.房间.对话/创建/删除/改名/模型列表/修改模型/修改预设/查看预设/刷新/私有/公开`：房间管理系统。

## 😎 API端点列表：

- 美国主站直连 `稳定`、`部分地区不可用`： `https://api.ohmygpt.com`
- Cloudflare CDN `稳定`、`全球加速`： `https://cfcus02.opapi.win`
- Cloudflare Worker `稳定`、`全球加速`： `https://cfwus02.opapi.win`
- 优质线路反代1 `优质线路`、`不保证可用性`： `https://aigptx.top`
- 优质线路反代2 `优质线路`、`不保证可用性`： `https://cn2us02.opapi.win`

## 🍰 致谢

- [Koishi](https://koishi.chat/) - 机器人框架
- [OhMyGPT](https://www.ohmygpt.com?aff=xr26JIUD) - 便捷地无限量访问先进的AI模型

## 许可证

[MIT](https://opensource.org/licenses/MIT) License © 2024
