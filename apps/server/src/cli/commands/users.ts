import { banUser, unbanUser } from '../../services/userService.js';

export async function runUsersCommand(action: string, arg: string): Promise<void> {
  switch (action) {
    case 'ban': {
      const { sessionCount } = await banUser(arg);
      console.log(`✓ User ${arg} has been banned (${sessionCount} active session(s) revoked)`);
      // TODO(story-3.4): WS hub will detect missing sessions on heartbeat and emit session:revoked
      break;
    }
    case 'unban':
      await unbanUser(arg);
      console.log(`✓ User ${arg} has been unbanned`);
      break;
    default:
      throw new Error(`Unknown users action: ${action}. Valid: ban, unban`);
  }
}
