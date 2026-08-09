/**
 * Valkey pub/sub listener.
 *
 * Subscribes to match events and forwards notifications to Discord.
 */

import type Redis from 'ioredis'
import type { TextChannel } from 'discord.js'
import { getEnv } from '../config/env.js'

const NOTIFICATION_TYPES = new Set([
  'round_start',
  'round_end',
  'game_end',
  'buzzer_winner',
  'navigate',
  'player_score_updated',
])

const PHASE_NAMES: Record<string, string> = {
  kdc: 'Khởi Động Chung',
  kdr: 'Khởi Động Cá Nhân',
  bp: 'Bứt Phá',
  vdc: 'Về Đích Chung',
  vdr: 'Về Đích Cá Nhân',
  gm: 'Giải Mã',
}

export function startValkeyListener(
  valkeySub: Redis,
  getChannel: () => TextChannel | null,
) {
  const env = getEnv()
  const channel = env.MATCH_CODE

  valkeySub.subscribe(`events:${channel}`, (err) => {
    if (err) {
      console.error(`Failed to subscribe to events:${channel}`, err)
    } else {
      console.log(`Subscribed to events:${channel}`)
    }
  })

  valkeySub.on('message', async (_ch, message) => {
    try {
      const data = JSON.parse(message)
      const msgType = data.type as string

      if (!NOTIFICATION_TYPES.has(msgType)) return

      const discordChannel = getChannel()
      if (!discordChannel) return

      const embed = buildNotification(data, msgType)
      if (embed) {
        await discordChannel.send({ embeds: [embed] }).catch(() => {})
      }
    } catch {
      // ignore parse errors
    }
  })
}

function buildNotification(data: Record<string, unknown>, msgType: string) {
  const { EmbedBuilder } = require('discord.js')
  const phase = data.phase as string | undefined
  const phaseName = phase ? (PHASE_NAMES[phase] ?? phase) : ''

  switch (msgType) {
    case 'round_start':
      return new EmbedBuilder()
        .setTitle(`🎬 Bắt đầu: ${phaseName}`)
        .setColor(0x00ff00)
        .setTimestamp()

    case 'round_end':
      return new EmbedBuilder()
        .setTitle(`🏁 Kết thúc: ${phaseName}`)
        .setColor(0xff9900)
        .setTimestamp()

    case 'game_end':
      return new EmbedBuilder()
        .setTitle('🏆 Trò chơi kết thúc!')
        .setColor(0xffd700)
        .setTimestamp()

    case 'buzzer_winner':
      return new EmbedBuilder()
        .setTitle(`⚡ Buzzer`)
        .setDescription(`**${data.user_code}** đã buzz đúng!`)
        .setColor(0x00ffff)
        .setTimestamp()

    case 'navigate':
      return new EmbedBuilder()
        .setTitle(`➡️ Di chuyển`)
        .setDescription(`Đi đến: \`${data.path}\``)
        .setColor(0x5865f2)
        .setTimestamp()

    default:
      return null
  }
}
