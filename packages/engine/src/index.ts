// Engine — public API
export { runAgent } from "./agent";
export { EventStore } from "./event-store";
export { buildContext } from "./context-builder";
export { buildSoul, deepRebuildSoul } from "./soul-builder";
export { updateWorkingMemory } from "./memory-writer";
export { runReflexion } from "./reflexion";
export { analyzeEmotion, detectCrisis } from "./emotion";
export { checkPermission, isToolAllowed } from "./permissions";
export { embedText, tryEmbed } from "./embeddings";
export { processQueue, initHeartbeat } from "./heartbeat";
export { withLane } from "./lane-queue";
export { createSSEStream } from "./gateway/sse";
export { routeMessage } from "./gateway/router";
export { getAllTools, getCoreTools, getToolsByTier } from "./tools";
export { CORE_TOOLS } from "./tools/core";
export { KNOWLEDGE_TOOLS } from "./tools/knowledge";
export { COMMUNICATION_TOOLS } from "./tools/communication";
export { ADMIN_TOOLS } from "./tools/admin";

// Client-side (kept from scaffold)
export { parseSSEStream } from "./stream-parser";
export { useChatEngine } from "./use-chat-engine";
export type { ChatEngineState, UseChatEngineReturn } from "./use-chat-engine";
