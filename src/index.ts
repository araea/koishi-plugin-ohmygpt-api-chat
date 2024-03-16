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

1. 请前往 [OhMyGPT 官网](https://www.ohmygpt.com?aff=xr26JIUD) 获取 OhMyGPT 的 API 密钥。
2. 为指令取合适的别名，启用该插件。

## 📚 命令列表

- \`OhMyGPTChat.预设.添加/修改/删除/查看\`：预设管理系统。
- \`OhMyGPTChat.房间.聊天记录.查看/修改/删除\`：房间聊天记录管理系统。
- \`OhMyGPTChat.房间.对话/创建/删除/改名/模型列表/修改模型/修改预设/查看预设/刷新/私有/公开\`：房间管理系统。

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
  maxTokens: number
  temperature: number
  isTextToImageConversionEnabled: boolean
}

// pzx*
const models = ['claude-3-opus', 'claude-3-opus-20240229', 'claude-3-sonnet', 'claude-3-sonnet-20240229', 'claude-3-haiku', 'claude-3-haiku-20240307', 'claude-2', 'claude-2.0', 'claude-2.1', 'claude-instant-1', 'claude-instant-1.2',
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-0301",
  "gpt-3.5-turbo-0613",
  "gpt-3.5-turbo-16k",
  "gpt-3.5-turbo-16k-0613",
  "gpt-3.5-turbo-1106",
  "gpt-3.5-turbo-0125",
  "gpt-4",
  "gpt-4-1106-preview",
  "gpt-4-0125-preview",
  "gpt-4-turbo-preview",
  "gpt-4-vision-preview",
  "gpt-4-0314",
  "gpt-4-0613",
  "gpt-4-32k",
  "gpt-4-32k-0314",
  "gpt-4-32k-0613",
  "serper",
];

export const Config: Schema<Config> = Schema.object({
  model: Schema.union(models).default('claude-2.1').description(`默认使用的模型名称。`),
  apiEndpoint: Schema.union(['https://api.ohmygpt.com/', 'https://apic.ohmygpt.com/', 'https://cfwus02.opapi.win/', 'https://cfcus02.opapi.win/',
    'https://aigptx.top/', 'https://cn2us02.opapi.win/', 'https://ngedlktfticp.cloud.sealos.io/']).default('https://apic.ohmygpt.com/')
    .description(`API 端点。`),
  OhMyGPTApiKey: Schema.string().required().description(`OhMyGPT 的官方 API 密钥。`),
  maxTokens: Schema.number().min(0).max(4096).default(4096).description(`最大令牌数。`),
  temperature: Schema.number().min(0).max(1).default(1).description(`温度。`),
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
  roomModel: string;
  isExist?: boolean;
}

type Message = {
  role: "user" | "assistant" | "system";
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
    roomModel: 'string',
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
          return await sendMessage(session, `【@${session.username}】\n该房间为私有！\n请联系房主【${roomInfo.roomBuilderName}】邀请你！`);
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
    .option('specific', '-s <messageIndex> 指定具体的消息', {fallback: undefined})
    .action(async ({session, options}, roomName) => {
      const {username} = session
      if (!roomName) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${username}】\n房间名不存在！`)
      }
      const messageList: MessageList = roomInfo.messageList
      if (options.specific) {
        if (isNaN(options.specific) || options.specific <= 0) {
          return await sendMessage(session, `【@${username}】\n消息索引必须为正整数！`)
        } else if (options.specific > roomInfo.messageList.length) {
          return await sendMessage(session, `【@${username}】\n消息索引超出范围！`)
        }
        return await sendMessage(session, `【@${username}】\n聊天记录序号：【${options.specific}】\n${messageList[options.specific - 1].role === 'user' ? `【user】` : '【assistant】'}：${messageList[options.specific - 1].content}`)
      }
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
      } else if (roomInfo.isPrivate) {
        // if (session.userId !== roomInfo.roomBuilderId) {
        //   return await sendMessage(session, `【@${session.username}】\n非房主无权刷新！`)
        // }
        if (!checkUserId(roomInfo.userIdList, session.userId)) {
          return await sendMessage(session, `【@${session.username}】\n非房间成员无法修改！`)
        }
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
      } else if (roomInfo.isPrivate) {
        // if (session.userId !== roomInfo.roomBuilderId) {
        //   return await sendMessage(session, `【@${session.username}】\n非房主无权刷新！`)
        // }
        if (!checkUserId(roomInfo.userIdList, session.userId)) {
          return await sendMessage(session, `【@${session.username}】\n非房间成员无法删除！`)
        }
      }
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
      let messageList: MessageList = roomInfo.messageList
      let result = ''
      if (roomInfo.roomModel === '') {
        await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {roomModel: config.model})
        roomInfo.roomModel = config.model
      }
      if (roomInfo.roomModel.includes('gpt') || config.apiEndpoint === 'https://ngedlktfticp.cloud.sealos.io/') {
        result = await callOpenAIChatAPI(messageList, roomInfo.roomPresetContent, roomInfo.roomModel)
      } else if (roomInfo.roomModel === 'serper') {
        result = await searchAndFormatResults(message)
      } else {
        result = await getAnthropicResponse(messageList, roomInfo.roomPresetContent, roomInfo.roomModel)
      }
      messageList.push({role: 'assistant', content: result})
      if (result === '请求失败，请重试！') {
        messageList = deleteMessages(messageList.length - 1, messageList)
      }
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {messageList, isRequesting: false})
      return await sendMessage(session, `序号：【${result === '请求失败，请重试！' ? messageList.length + 2 : messageList.length}】\n【@${username}】\n${result}`)
    })


  // 创建房间 cj*
  ctx.command('OhMyGPTChat.房间.创建 <roomName> <roomPreset:text>', '创建房间')
    .option('model', '-m <model> 指定模型', {fallback: undefined})
    .action(async ({session, options}, roomName, roomPreset) => {
      if (!roomName || !roomPreset) {
        const {username} = session
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      let roomModel = config.model
      if (options.model) {
        if (models.includes(options.model)) {
          roomModel = options.model
        } else {
          return await sendMessage(session, `【@${session.username}】\n模型不存在！\n可用模型如下：\n> ${models.join('\n> ')}\n请使用 -m [模型名] 指定模型。`)
        }
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
        roomModel,
      })
      return await sendMessage(session, `【@${session.username}】\n创建成功！\n您可以直接使用下面的指令调用：\n${roomName} [文本]`)
    })

  // 删除房间 sc*
  ctx.command('OhMyGPTChat.房间.删除 <roomName:text>', '删除房间')
    .action(async ({session}, roomName) => {
      const {username} = session
      if (!roomName) {
        await sendMessage(session, `【@${username}】\n请检查输入的参数！`);
        return;
      }

      const roomNames = roomName.split(' ');
      let successRooms = [];
      let failedRooms = [];

      for (let room of roomNames) {
        const roomInfo = await isRoomNameExist(room)
        if (!roomInfo.isExist || session.userId !== roomInfo.roomBuilderId) {
          failedRooms.push(room);
          continue;
        }
        await ctx.database.remove('OhMyGpt_rooms', {roomName: room})
        successRooms.push(room);
      }

      let message = '';
      if (successRooms.length > 0) {
        message += `【@${session.username}】\n房间 ${successRooms.join(', ')} 删除成功！\n`;
      }
      if (failedRooms.length > 0) {
        message += `【@${session.username}】\n房间 ${failedRooms.join(', ')} 删除失败！\n`;
        if (failedRooms.some(async (room) => !(await isRoomNameExist(room)).isExist)) {
          message += `原因：部分房间不存在。\n`;
        }
        if (failedRooms.some(async (room) => session.userId !== (await isRoomNameExist(room)).roomBuilderId)) {
          message += `原因：部分房间你无权删除。\n`;
        }
      }
      await sendMessage(session, message);
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

  // 修改模型 xg*
  ctx.command('OhMyGPTChat.房间.修改模型 <roomName> <newRoomModel>', '修改房间模型')
    .action(async ({session}, roomName, newRoomModel) => {
      const {username} = session
      if (!roomName || !newRoomModel) {
        return await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
      }
      const roomInfo = await isRoomNameExist(roomName)
      if (!roomInfo.isExist) {
        return await sendMessage(session, `【@${session.username}】\n房间名不存在`)
      } else if (session.userId !== roomInfo.roomBuilderId) {
        return await sendMessage(session, `【@${session.username}】\n非房主无权修改！`)
      }
      if (!models.includes(newRoomModel)) {
        return await sendMessage(session, `【@${session.username}】\n模型不存在！\n可用模型如下：\n> ${models.join('\n> ')}`)
      }
      await ctx.database.set('OhMyGpt_rooms', {roomName: roomName}, {roomModel: newRoomModel})
      return await sendMessage(session, `【@${session.username}】\n修改成功！`)
    })

  // 模型列表
  ctx.command('OhMyGPTChat.房间.模型列表', '查看可用模型列表')
    .action(async ({session}, roomName, newRoomModel) => {
      const {username} = session
      return await sendMessage(session, `【@${session.username}】\n当前可用模型如下：\n> ${models.join('\n> ')}`)
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
  ctx.command('OhMyGPTChat.房间.刷新 <roomName:text>', '刷新房间')
    .action(async ({session}, roomName) => {
      const {username} = session
      if (!roomName) {
        await sendMessage(session, `【@${username}】\n请检查输入的参数！`)
        return;
      }

      const roomNames = roomName.split(' ');
      let successRooms = [];
      let failedRooms = [];

      for (let room of roomNames) {
        const roomInfo = await isRoomNameExist(room)
        if (!roomInfo.isExist || (roomInfo.isPrivate && !checkUserId(roomInfo.userIdList, session.userId))) {
          failedRooms.push(room);
          continue;
        }
        await ctx.database.set('OhMyGpt_rooms', {roomName: room}, {
          messageList: [] as MessageList,
          isRequesting: false
        })
        successRooms.push(room);
      }

      let message = '';
      if (successRooms.length > 0) {
        message += `【@${session.username}】\n房间 ${successRooms.join(', ')} 刷新成功！\n`;
      }
      if (failedRooms.length > 0) {
        message += `【@${session.username}】\n房间 ${failedRooms.join(', ')} 刷新失败！\n`;
        if (failedRooms.some(async (room) => !(await isRoomNameExist(room)).isExist)) {
          message += `原因：部分房间不存在。\n`;
        }
        if (failedRooms.some(async (room) => (await isRoomNameExist(room)).isPrivate && !checkUserId((await isRoomNameExist(room)).userIdList, session.userId))) {
          message += `原因：部分房间你无权刷新。\n`;
        }
      }
      await sendMessage(session, message);
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
房间模型：【${roomInfo.roomModel}】
房间预设名：【${roomInfo.roomPresetName}】
预设概览：【${roomInfo.roomPresetContent.length > 50 ? roomInfo.roomPresetContent.slice(0, 50) + "..." : roomInfo.roomPresetContent}】
房间成员：【${roomInfo.usernameList.map(async (element) => `【${element}】`).join("，")}】`)
      } else {
        return await sendMessage(session, `【@${session.username}】\n房间名：【${roomName}】
房主：【${roomInfo.roomBuilderName}】
房间状态：【公开】
房间模型：【${roomInfo.roomModel}】
房间预设名：【${roomInfo.roomPresetName}】
预设概览：【${roomInfo.roomPresetContent.length > 50 ? roomInfo.roomPresetContent.slice(0, 50) + "..." : roomInfo.roomPresetContent}】`)
      }
    })
  // 清空房间列表
  ctx.command('OhMyGPTChat.房间.清空列表', '清空房间列表', {authority: 3})
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
    .option('all', '-a 完整预设', {fallback: false})
    .action(async ({session, options}, presetName) => {
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
      if (str.length > 200 && !options.all) {
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
  function deleteMessages(messageIndex: number, messageList: MessageList): MessageList {
    let newMessageList = [...messageList];
    let currentMessage = newMessageList[messageIndex - 1];

    if (currentMessage.role === "user") {
      newMessageList.splice(messageIndex - 1, 2);
    } else if (currentMessage.role === "assistant" && messageIndex >= 2) {
      newMessageList.splice(messageIndex - 2, 2);
    }

    return newMessageList;
  }

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
      roomBuilderName,
      roomModel,
      usernameList,
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
      roomBuilderName,
      roomModel,
      usernameList,
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
      await session.send(`${h.image(imageBuffer, 'image/png')}`)
    } else {
      await session.send(`${message}`)
    }
  }

  async function searchAndFormatResults(query: string): Promise<string> {
    const url = `${config.apiEndpoint}api/v1/openapi/search/serper/v1`;
    const params = new URLSearchParams({
      q: query,
      // cache: '3',
      // gl: 'us',
      // hl: 'en',
      // page: '1',
      // num: '10'
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${config.OhMyGPTApiKey}`
        },
        body: params
      });


      if (response.ok) {
        const data = await response.json();

        interface SearchResult {
          title: string;
          link: string;
          snippet?: string;
          date?: string;
          imageUrl?: string;
        }

        const formattedResults = data.organic.map((result: SearchResult, index: number) => {
          const formattedSnippet = result.snippet ? `\n摘录：${result.snippet}` : '';
          const formattedDate = result.date ? `\n日期：${result.date}` : '';
          const formattedImage = result.imageUrl ? `\n预览图： ${h.image(result.imageUrl)}` : '';
          return `${index + 1}. ${result.title} - ${result.link}${formattedSnippet}${formattedDate}${formattedImage}\n`;
        });
        return formattedResults.join('\n');
      } else {
        throw new Error('Request failed');
      }
    } catch (error) {
      logger.error('Error:', error);
      return "请求失败，请重试！";
    }
  }

  async function callOpenAIChatAPI(messageList: MessageList, systemPrompt: string, model: string) {
    const url = `${config.apiEndpoint}v1/chat/completions`;
    const newMessageList = messageList.slice()
    // if (config.apiEndpoint !== 'https://ngedlktfticp.cloud.sealos.io/') {
    newMessageList.unshift({role: 'system', content: systemPrompt})
    // }

    const requestBody = {
      model: model,
      messages: newMessageList,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.OhMyGPTApiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      const responseData = await response.json();
      return responseData.choices[0].message.content;
    } catch (error) {
      logger.error('Error:', error);
      return "请求失败，请重试！";
    }
  }

  async function getAnthropicResponse(messageList: MessageList, systemPrompt: string, model: string): Promise<string> {
    const url = `${config.apiEndpoint}v1/messages`;

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': config.OhMyGPTApiKey,
      'anthropic-version': '2023-06-01'
    };

    const data = {
      model: model,
      system: systemPrompt,
      max_tokens: config.maxTokens,
      messages: messageList,
      temperature: config.temperature,
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

