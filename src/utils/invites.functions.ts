// Legacy shim — invitations flow has been replaced by concert meetups.
// Re-export the new meetups API so any lingering imports keep working.
export {
  listMyGroups,
  getGroupDetails,
  listGroupMessages,
  sendGroupMessage,
  leaveGroup,
  runConcertMatching,
  setConcertIntent,
} from "./meetups.functions";
