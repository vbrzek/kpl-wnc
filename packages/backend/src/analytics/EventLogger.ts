import db from '../db/db.js';
import type { GameRoom } from '@kpl/shared';

class EventLogger {
  private async insert(
    eventType: 'room_created' | 'settings_updated' | 'game_started',
    roomCode: string,
    detail: Record<string, unknown>
  ): Promise<void> {
    try {
      await db.transaction(async (trx) => {
        const [eventId] = await trx('game_events').insert({
          event_type: eventType,
          room_code: roomCode,
        });
        await trx(`game_event_${eventType}`).insert({ event_id: eventId, ...detail });
      });
    } catch (err) {
      console.error('[Analytics] Failed to log event:', eventType, err);
    }
  }

  async logRoomCreated(room: GameRoom, hostNickname: string): Promise<void> {
    await this.insert('room_created', room.code, {
      host_nickname: hostNickname,
      room_name: room.name,
      is_public: room.isPublic,
      max_players: room.maxPlayers,
      win_condition: room.winCondition,
      target_score: room.winCondition === 'score' ? room.targetScore : null,
      target_rounds: room.winCondition === 'rounds' ? room.targetRounds : null,
      game_time_limit: room.winCondition === 'time' ? room.gameTimeLimit : null,
      set_ids: JSON.stringify(room.selectedSetIds),
      special_rules: JSON.stringify(room.specialRules),
    });
  }

  async logSettingsUpdated(room: GameRoom, changedByNickname: string): Promise<void> {
    await this.insert('settings_updated', room.code, {
      changed_by: changedByNickname,
      room_name: room.name,
      is_public: room.isPublic,
      max_players: room.maxPlayers,
      win_condition: room.winCondition,
      target_score: room.winCondition === 'score' ? room.targetScore : null,
      target_rounds: room.winCondition === 'rounds' ? room.targetRounds : null,
      game_time_limit: room.winCondition === 'time' ? room.gameTimeLimit : null,
      set_ids: JSON.stringify(room.selectedSetIds),
      special_rules: JSON.stringify(room.specialRules),
    });
  }

  async logGameStarted(room: GameRoom): Promise<void> {
    const activePlayers = room.players.filter(p => !p.isAfk);
    await this.insert('game_started', room.code, {
      player_count: activePlayers.length,
      players: JSON.stringify(activePlayers.map(p => ({ nickname: p.nickname }))),
    });
  }
}

export const eventLogger = new EventLogger();
