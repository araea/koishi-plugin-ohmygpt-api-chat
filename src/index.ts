import {Context, h, Schema} from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import {} from 'koishi-plugin-monetary'
import {} from 'koishi-plugin-markdown-to-image-service'

export const inject = {
  required: ['database'],
  optional: ['markdownToImage', 'monetary'],
}
export const name = 'ohmygpt-api-chat'
export const usage = `## 😺 使用

1. 获取 OhMyGPT 的 API 密钥，请前往 [OhMyGPT 官网](https://www.ohmygpt.com?aff=xr26JIUD)。
2. 启用该插件。

## 📚 命令列表

- \`OhMyGPTChat.房间.查看聊天记录/修改聊天记录/对话/创建/删除/改名/修改预设/查看预设/刷新/私有/公开\`：房间管理系统。
- \`OhMyGPTChat.预设.添加/修改/删除/查看\`：预设管理系统。

## 😎 API端点列表：

- 美国主站直连 \`稳定\`、\`部分地区不可用\`： \`https://api.ohmygpt.com\`
- Cloudflare CDN \`稳定\`、\`全球加速\`： \`https://cfcus02.opapi.win\`
- Cloudflare Worker \`稳定\`、\`全球加速\`： \`https://cfwus02.opapi.win\`
- 优质线路反代1 \`优质线路\`、\`不保证可用性\`： \`https://aigptx.top\`
- 优质线路反代2 \`优质线路\`、\`不保证可用性\`： \`https://cn2us02.opapi.win\``

export interface Config {
  model: string
  apiEndpoint: string
  OhMyGPTApiKey: string
  isTextToImageConversionEnabled: boolean
}

export const Config: Schema<Config> = Schema.object({
  model: Schema.union(['claude-3-opus', 'claude-3-sonnet', 'claude-2', 'claude-instant-1']).default('claude-2').description(`模型名称。`),
  apiEndpoint: Schema.union(['https://api.ohmygpt.com/', 'https://apic.ohmygpt.com/', 'https://cfwus02.opapi.win/', 'https://cfcus02.opapi.win/', 'https://aigptx.top/', 'https://cn2us02.opapi.win/']).default('https://apic.ohmygpt.com/')
    .description(`API 端点。`),
  OhMyGPTApiKey: Schema.string().required().description(`OhMyGPT 的官方 API 密钥。`),
  isTextToImageConversionEnabled: Schema.boolean().default(false).description(`是否开启将文本转为图片的功能（可选），如需启用，需要启用 \`markdownToImage\` 服务。`),
}) as any

declare module 'koishi' {
  interface Tables {
    OhMyGpt_rooms: OhMyGPTRoom
    OhMyGpt_presets: OhMyGPTPreset
  }
}

export interface OhMyGPTRoom {
  id: number,
  roomName: string
  roomPresetName: string
  roomPresetContent: string
  isPrivate: boolean
  userIdList: string[]
  usernameList: string[]
  roomBuilderId: string
  roomBuilderName: string
  quoteId: string
  messageList: MessageList
  isRequesting: boolean;
  isExist?: boolean;
}

type Message = {
  role: "user" | "assistant";
  content: string;
};

type MessageList = Message[];

export interface OhMyGPTPreset {
  id: number
  presetName: string
  presetContent: string
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('OhMyGPTChat') // tzb*
  ctx.database.extend('OhMyGpt_rooms', {
    id: 'unsigned',
    roomName: 'string',
    roomPresetName: 'string',
    roomPresetContent: 'text',
    isPrivate: 'boolean',
    isRequesting: 'boolean',
    userIdList: 'list',
    usernameList: 'list',
    roomBuilderId: 'string',
    roomBuilderName: 'string',
    quoteId: 'string',
    messageList: {type: 'json', initial: [] as MessageList}
  }, {
    autoInc: true,
    primary: 'id',
    unique: ['roomName'],
  })
  ctx.database.extend('OhMyGpt_presets', {
    id: 'unsigned',
    presetName: 'string',
    presetContent: 'text',
  }, {
    primary: 'id',
    autoInc: true,
    unique: ['presetName'],
  })

  // zjj*
  ctx.middleware(async (session, next) => {
    const roomName = session.content.match(/^[^\s]+/)?.[0];
    const content = session.content.replace(/^[^\s]+\s*/, '');
    if (!content) {
      return await next();
    }
    const roomInfo = await isRoomNameExist(roomName);
    // 房间是否存在
    if (roomInfo.isExist) {
      // 房间是否私有
      if (roomInfo.isPrivate) {
        // 成员是否在房间里
        if (checkUserId(roomInfo.userIdList, session.userId)) {
          ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {quoteId: session.messageId})
          session.execute(`OhMyGPTChat.房间.对话 ${roomName} ${content}`);
        } else {
          return await sendMessage(session, `【@${session.username}】\n该房间为私有！\n请联系房主 ${roomInfo.roomBuilderName} 邀请你！`);
        }
      } else {
        ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {quoteId: session.messageId})
        session.execute(`OhMyGPTChat.房间.对话 ${roomName} ${content}`);
        return
      }
    } else {
      return await next();
    }
    return await next();
  });
  // officialClaude 帮助
  ctx.command('OhMyGPTChat', 'officialClaude帮助')
    .action(async ({session}) => {
      await session.execute(`OhMyGPTChat -h`)
    })

  // ckltjl*
  ctx.command('OhMyGPTChat.房间.聊天记录.查看 <roomName>', '查看聊天记录')
    .action(async ({session}, roomName) => {
      const {username} = session
      if (!roomName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${username}】\n房间名不存在！`)
      }
      const messageList: MessageList = roomInfo.messageList
      let message = ''
      for (let i = 0; i < messageList.length; i++) {
        const messageNumber = i + 1
        const truncatedContent = messageList[i].content.length > 50 ? `${messageList[i].content.substring(0, 50)}...` : messageList[i].content
        message += `${messageNumber}. ${messageList[i].role === 'user' ? `【user】` : '【assistant】'}：${truncatedContent}\n`
      }
      return await sendMessage(session, `【@${username}】\n${message}`)
    })

  // xgltjl*
  ctx.command('OhMyGPTChat.房间.聊天记录.修改 <roomName> <messageIndex:number> <modifiedMessage:text>', '修改聊天记录内容')
    .action(async ({session}, roomName, messageIndex, modifiedMessage) => {
      const {username} = session
      if (!roomName || !messageIndex) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      if (isNaN(messageIndex) || messageIndex <= 0) {
        return await sendMessage(session, `【@${username}】\n消息索引必须为正整数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${username}】\n房间名不存在！`)
      } else if (messageIndex > roomInfo.messageList.length) {
        return await sendMessage(session, `【@${username}】\n消息索引超出范围！`)
      }
      const messageList: MessageList = roomInfo.messageList
      messageList[messageIndex - 1].content = modifiedMessage;
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {messageList})
      return await sendMessage(session, `【@${username}】\n修改成功！`)
    })

  // scltjl*
  ctx.command('OhMyGPTChat.房间.聊天记录.删除 <roomName> <messageIndex:number>', '删除聊天记录内容')
    .action(async ({session}, roomName, messageIndex) => {
      const {username} = session
      if (!roomName || !messageIndex) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      if (isNaN(messageIndex) || messageIndex <= 0) {
        return await sendMessage(session, `【@${username}】\n消息索引必须为正整数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${username}】\n房间名不存在！`)
      } else if (messageIndex > roomInfo.messageList.length) {
        return await sendMessage(session, `【@${username}】\n消息索引超出范围！`)
      }
      const deleteMessages = (messageIndex: number, messageList: MessageList): MessageList => {
        // if (messageIndex <= 0 || messageIndex >= messageList.length) {
        //   return messageList;
        // }
        const newMessageList = [...messageList];
        const currentMessage = newMessageList[messageIndex - 1];

        if (currentMessage.role === "user") {
          newMessageList.splice(messageIndex - 1, 2);
        } else if (currentMessage.role === "assistant" && messageIndex >= 2) {
          newMessageList.splice(messageIndex - 2, 2);
        }

        return newMessageList;
      };
      const messageList = deleteMessages(messageIndex, roomInfo.messageList);
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {messageList})
      return await sendMessage(session, `【@${username}】\n删除成功！`)
    })

  // 与 officialClaude 对话 dh*
  ctx.command('OhMyGPTChat.房间.对话 <roomName> <message:text>', '对话')
    .action(async ({session}, roomName, message) => {
      const {username} = session
      if (!roomName || !message) {
        await session.execute(`OhMyGPTChat.房间.对话 -h`)
        return
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (roomInfo.isRequesting) {
        return await sendMessage(session, `【@${username}】\n该房间暂不空闲，请稍后再试！`)
      }
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {isRequesting: true})
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${username}】\n房间名不存在！`)
      }
      roomInfo.messageList.push({role: 'user', content: message})
      const messageList: MessageList = roomInfo.messageList
      const result = await getAnthropicResponse(messageList, roomInfo.roomPresetContent)
      messageList.push({role: 'assistant', content: result})
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {messageList, isRequesting: false})
      return await sendMessage(session, `序号：【${messageList.length}】\n【@${username}】\n${result}`)
    })


  // 创建房间 cj*
  ctx.command('OhMyGPTChat.房间.创建 <roomName> <roomPreset:text>', '创建房间')
    .action(async ({session}, roomName, roomPreset) => {
      if (!roomName || !roomPreset) {
        const {username} = session
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名已存在！`)
      }
      let roomPresetName = '无'
      const presetInfo = await isPresetNameExist(roomPreset)
      if (presetInfo.isExist) {
        roomPresetName = roomPreset
        roomPreset = presetInfo.presetContent
      }
      await ctx.database.create('OhMyGpt_rooms', {
        roomName: roomName,
        roomPresetContent: roomPreset,
        roomPresetName: roomPresetName,
        isPrivate: false,
        roomBuilderId: session.userId,
        roomBuilderName: session.username,
        userIdList: [`${session.userId}`],
        usernameList: [`${session.username}`],
      })
      return await sendMessage(session, `【@${session.username}】\n创建成功！\n您可以直接使用下面的指令调用：\n${roomName} [文本]`)
    })

  // 删除房间 sc*
  ctx.command('OhMyGPTChat.房间.删除 <roomName>', '删除房间')
    .action(async ({session}, roomName) => {
      const {username} = session
      if (!roomName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在`)
      } else if (session.userId !== roomInfo.roomBuilderId) {
        return await sendMessage(session, `【@${session.username}】\n非房主无权删除！`)
      }
      await ctx.database.remove('OhMyGpt_rooms', {roomName: roomName})
      return await sendMessage(session, `【@${session.username}】\n删除成功！`)
    })

  // 修改房间名 xg*
  ctx.command('OhMyGPTChat.房间.改名 <roomName> <newRoomName>', '修改房间名')
    .action(async ({session}, roomName, newRoomName) => {
      const {username} = session
      if (!roomName || !newRoomName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在`)
      } else if (session.userId !== roomInfo.roomBuilderId) {
        return await sendMessage(session, `【@${session.username}】\n非房主无权修改！`)
      }
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {roomName: newRoomName})
      return await sendMessage(session, `【@${session.username}】\n修改成功！`)
    })

  // 修改房间预设
  ctx.command('OhMyGPTChat.房间.修改预设 <roomName> <newPreset:text>', '修改房间预设')
    .action(async ({session}, roomName, newPreset) => {
      const {username} = session
      if (!roomName || !newPreset) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在`)
      } else if (session.userId !== roomInfo.roomBuilderId) {
        return await sendMessage(session, `【@${session.username}】\n非房主无权修改！`)
      }
      const presetInfo = await isPresetNameExist(newPreset)
      if (presetInfo.isExist) {
        newPreset = presetInfo.presetContent
      }
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {roomPresetContent: newPreset})
      return await sendMessage(session, `【@${session.username}】\n修改成功！`)
    })

  // 查看房间预设
  ctx.command('OhMyGPTChat.房间.查看预设 <roomName>', '查看房间预设')
    .action(async ({session}, roomName) => {
      const {username} = session
      if (!roomName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在`)
      }
      const str = roomInfo.roomPresetContent
      // 检查字符串是否超过 200 个字符
      if (str.length > 200) {
        // 如果是，将前 200 个字符切片，并附加 “…” 来表示截断
        return await sendMessage(session, `【@${session.username}】\n${str.slice(0, 200) + "..."}`);
      } else {
        // 如果没有，则原样返回字符串
        return await sendMessage(session, `【@${session.username}】\n${str}`);
      }
    })

  // 刷新房间 sx*
  ctx.command('OhMyGPTChat.房间.刷新 <roomName>', '刷新房间')
    .action(async ({session}, roomName) => {
      const {username} = session
      if (!roomName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在`)
      } else if (roomInfo.isPrivate) {
        if (!checkUserId(roomInfo.userIdList, session.userId)) {
          return await sendMessage(session, `【@${session.username}】\n非房间成员无法刷新！`)
        }
      }
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {
        messageList: [] as MessageList,
        isRequesting: false
      })
      return await sendMessage(session, `【@${session.username}】\n刷新成功！`)
    })

  // 私有房间
  ctx.command('OhMyGPTChat.房间.私有 <roomName>', '私有房间')
    .action(async ({session}, roomName) => {
      const {username} = session
      if (!roomName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在！`)
      } else if (session.userId !== roomInfo.roomBuilderId) {
        return await sendMessage(session, `【@${session.username}】\n非房主无权私有！`)
      } else if (roomInfo.isPrivate) {
        return await sendMessage(session, `【@${session.username}】\n房间已在私有状态！`)
      }
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {isPrivate: true})
      return await sendMessage(session, `【@${session.username}】\n房间已私有！`)
    })

  // 公开房间
  ctx.command('OhMyGPTChat.房间.公开 <roomName>', '公开房间')
    .action(async ({session}, roomName) => {
      const {username} = session
      if (!roomName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在！`)
      } else if (session.userId !== roomInfo.roomBuilderId) {
        return await sendMessage(session, `【@${session.username}】\n非房主无权公开！`)
      } else if (!roomInfo.isPrivate) {
        return await sendMessage(session, `【@${session.username}】\n房间已在公开状态！`)
      }
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {isPrivate: false})
      return await sendMessage(session, `【@${session.username}】\n房间已公开！`)
    })

  // 转移房间
  ctx.command('OhMyGPTChat.房间.转移 <roomName> <user>', '转移房间')
    .action(async ({session}, roomName, user) => {
      if (!user || !roomName) {
        return await sendMessage(session, `【@${session.username}】\n请检查输入的参数！`)
      }
      // 判断 user 的 type 是否为 at
      const userIdRegex = /<at id="(?<userId>[^"]+)"(?: name="(?<username>[^"]+)")?\/>/;
      const match = user.match(userIdRegex); // 检查 content 是否存在再进行匹配

      if (!match) {
        return await sendMessage(session, '未找到符合要求的用户 ID。');
      }

      const {userId, username} = match.groups;

      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在！`)
      } else if (session.userId !== roomInfo.roomBuilderId) {
        return await sendMessage(session, `【@${session.username}】\n非房主无权转移！`)
      }
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {roomBuilderId: userId, roomBuilderName: username})
      return await sendMessage(session, `【@${session.username}】\n房主已变更！`)
    })

  // 房间列表
  ctx.command('OhMyGPTChat.房间.列表', '房间列表')
    .action(async ({session}) => {
      const roomInfo = await ctx.database.get('OhMyGpt_rooms', {})
      // 初始化一个空字符串来存储房间列表
      let roomList: string = "";
      // 循环遍历输入数组，并在 roomList 字符串中添加带有数字和换行符的每个房间名
      for (let i = 0; i < roomInfo.length; i++) {
        roomList += `${i + 1}. ${roomInfo[i].roomName}\n`;
      }
      // 将 roomList 字符串发送
      return await sendMessage(session, `【@${session.username}】\n${roomList}`)
    })

  // 房间信息
  ctx.command('OhMyGPTChat.房间.信息 <roomName>', '房间信息')
    .action(async ({session}, roomName) => {
      const {username, guildId} = session
      if (!roomName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在！`)
      }
      if (roomInfo.isPrivate) {
        return await sendMessage(session, `【@${session.username}】\n房间名：【${roomName}】
房主：【${roomInfo.roomBuilderName}】
房间状态：【私有】
房间预设名：【${roomInfo.roomPresetName}】
预设概览：【${roomInfo.roomPresetContent.length > 50 ? roomInfo.roomPresetContent.slice(0, 50) + "..." : roomInfo.roomPresetContent}】
房间成员：【${roomInfo.usernameList.map(async (element) => `【${element}】`).join("，")}】`)
      } else {
        return await sendMessage(session, `【@${session.username}】\n房间名：【${roomName}】
房主：【${roomInfo.roomBuilderName}】
房间状态：【公开】
房间预设名：【${roomInfo.roomPresetName}】
预设概览：【${roomInfo.roomPresetContent.length > 50 ? roomInfo.roomPresetContent.slice(0, 50) + "..." : roomInfo.roomPresetContent}】`)
      }
    })
  // 清空房间列表
  ctx.command('OhMyGPTChat.房间.清空列表', '清空房间列表')
    .action(async ({session}) => {
      await ctx.database.remove('OhMyGpt_rooms', {})
      return await sendMessage(session, `【@${session.username}】\n房间列表已清空！`)
    })
  // 邀请成员
  ctx.command('OhMyGPTChat.房间.邀请 <user> <roomName>', '邀请成员')
    .action(async ({session}, user, roomName) => {
      if (!user || !roomName) {
        return await sendMessage(session, `【@${session.username}】\n请检查输入的参数！`)
      }
      // 判断 user 的 type 是否为 at
      const userIdRegex = /<at id="(?<userId>[^"]+)"(?: name="(?<username>[^"]+)")?\/>/;
      const match = user.match(userIdRegex); // 检查 content 是否存在再进行匹配

      if (!match) {
        return await sendMessage(session, '未找到符合要求的用户 ID。');
      }

      const {userId, username} = match.groups;

      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在！`)
      } else if (session.userId !== roomInfo.roomBuilderId) {
        return await sendMessage(session, `【@${session.username}】\n非房主无权邀请成员！`)
      } else if (!roomInfo.isPrivate) {
        return await sendMessage(session, `【@${session.username}】\n房间处于公开状态，无需邀请成员！`)
      }
      roomInfo.userIdList.push(userId);
      roomInfo.usernameList.push(username);
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {
        userIdList: roomInfo.userIdList,
        usernameList: roomInfo.usernameList
      })
      return await sendMessage(session, `【@${session.username}】\n已成功邀请成员！`)
    })

  // 踢出成员
  ctx.command('OhMyGPTChat.房间.踢出 <user> <roomName>', '踢出成员')
    .action(async ({session}, user, roomName) => {
      const {username} = session

      if (!user || !roomName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      // 判断 user 的 type 是否为 at
      const match = user.match(/<at\s+id="(\d+)"\s+name=".+?"\/>/);

      if (match === null) {
        return;
      }

      const userId = match[1];

      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在！`)
      } else if (session.userId !== roomInfo.roomBuilderId) {
        return await sendMessage(session, `【@${session.username}】\n非房主无权踢出成员！`)
      } else if (!roomInfo.isPrivate) {
        return await sendMessage(session, `【@${session.username}】\n房间处于公开状态，无需踢出成员！`)
      }
      let index = roomInfo.userIdList.indexOf(userId);

      if (index !== -1) {
        roomInfo.userIdList.splice(index, 1);
        roomInfo.usernameList.splice(index, 1);
      } else {
        return await sendMessage(session, `【@${session.username}】\n该成员不在房间中，无法踢出！`)
      }
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {
        userIdList: roomInfo.userIdList,
        usernameList: roomInfo.usernameList
      })
      return await sendMessage(session, `【@${session.username}】\n已成功踢出成员！`)
    })

  // 添加预设 tjys*
  ctx.command('OhMyGPTChat.预设.添加 <presetName> <presetContent:text>', '添加预设')
    .action(async ({session}, presetName, presetContent) => {
      const {username} = session
      if (!presetName || !presetContent) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const presetInfo = await isPresetNameExist(presetName)
      if (presetInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n预设已存在！`)
      }
      await ctx.database.create('OhMyGpt_presets', {presetName: presetName, presetContent: presetContent})
      return await sendMessage(session, `【@${session.username}】\n添加成功！`)
    })

  // 删除预设
  ctx.command('OhMyGPTChat.预设.删除 <presetName>', '删除预设')
    .action(async ({session}, presetName) => {
      const {username} = session
      if (!presetName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const presetInfo = await isPresetNameExist(presetName)
      if (!presetInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n预设不存在！`)
      }
      await ctx.database.remove('OhMyGpt_presets', {presetName: presetName})
      return await sendMessage(session, `【@${session.username}】\n删除成功！`)
    })

  // 修改预设 xgys*
  ctx.command('OhMyGPTChat.预设.修改 <presetName> <newPresetContent:text>', '修改预设')
    .action(async ({session}, presetName, newPresetContent) => {
      const {username} = session
      if (!presetName || !newPresetContent) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const presetInfo = await isPresetNameExist(presetName)
      if (!presetInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n预设不存在！`)
      }
      await ctx.database.set('OhMyGpt_presets', {presetName: presetName}, {presetContent: newPresetContent})
      return await sendMessage(session, `【@${session.username}】\n修改成功！`)
    })

  // 查看预设
  ctx.command('OhMyGPTChat.预设.查看 <presetName>', '查看预设')
    .action(async ({session}, presetName) => {
      const {username} = session
      if (!presetName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const presetInfo = await isPresetNameExist(presetName)
      if (!presetInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n预设不存在！`)
      }
      const str = presetInfo.presetContent
      // 检查字符串是否超过 200 个字符
      if (str.length > 200) {
        // 如果是，将前 200 个字符切片，并附加 “…” 来表示截断
        return await sendMessage(session, `【@${username}】\n${str.slice(0, 200)}...`);
      } else {
        return await sendMessage(session, `【@${username}】\n${str}`);
      }
    })

  // 预设列表
  ctx.command('OhMyGPTChat.预设.列表', '预设列表')
    .action(async ({session}) => {
      const presetInfo = await ctx.database.get('OhMyGpt_presets', {})
      // 初始化一个空字符串来存储房间列表
      let presetList: string = "";
      // 循环遍历输入数组，并在 presetList 字符串中添加带有数字和换行符的每个房间名
      for (let i = 0; i < presetInfo.length; i++) {
        presetList += `${i + 1}. ${presetInfo[i].presetName}\n`;
      }
      // 将 presetList 字符串发送
      return await sendMessage(session, `【@${session.username}】\n${presetList}`)
    })

  // hs*
  function checkUserId(userIds: string[], userId: string) {
    if (userIds.includes(userId)) {
      return true
    } else {
      return false
    }
  }

  async function isPresetNameExist(presetName: string) {
    const presetInfo = await ctx.database.get('OhMyGpt_presets', {presetName: presetName})
    if (presetInfo.length === 0) {
      return {isExist: false}
    } else {
      return {isExist: true, presetContent: presetInfo[0].presetContent}
    }
  }

  async function isRoomNameExist(roomName: string): Promise<OhMyGPTRoom> {
    const roomInfo = await ctx.database.get('OhMyGpt_rooms', {roomName});

    if (roomInfo.length === 0) {
      return {isExist: false} as OhMyGPTRoom;
    }

    const {
      roomPresetContent,
      roomPresetName,
      isPrivate,
      roomBuilderId,
      userIdList,
      quoteId,
      messageList,
      isRequesting,
      roomBuilderName
    } = roomInfo[0] as OhMyGPTRoom;

    return {
      isExist: true,
      roomPresetContent,
      roomPresetName,
      isPrivate,
      roomBuilderId,
      userIdList,
      quoteId,
      messageList,
      isRequesting,
      roomBuilderName
    } as OhMyGPTRoom;
  }

  async function sendMessage(session: any, message: any): Promise<void> {
    if (config.isTextToImageConversionEnabled) {
      const lines = message.split('\n');
      const modifiedMessage = lines
        .map((line) => {
          if (line.trim() !== '' && !line.includes('<img')) {
            return `# ${line}`;
          } else {
            return line + '\n';
          }
        })
        .join('\n');
      const imageBuffer = await ctx.markdownToImage.convertToImage(modifiedMessage);
      return await sendMessage(session, `${h.image(imageBuffer, 'image/png')}`)
    } else {
      return await sendMessage(session, message)
    }
  }

  async function getAnthropicResponse(messageList: MessageList, systemPrompt: string): Promise<string> {
    const url = `${config.apiEndpoint}v1/messages`;

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': config.OhMyGPTApiKey,
      'anthropic-version': '2023-06-01'
    };

    const data = {
      model: config.model,
      system: systemPrompt,
      max_tokens: 1024,
      messages: messageList
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data)
      });

      const responseData = await response.json();
      // logger.success(responseData);

      return responseData.content[0].text;
    } catch (error) {
      logger.error('Error:', error);
      return `请求失败，请重试！`;
    }
  };
}
