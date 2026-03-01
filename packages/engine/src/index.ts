// Engine — public API
export { runAgent } from "./agent";
export { EventStore } from "./event-store";
export { buildContext } from "./context-builder";
export { createSSEStream } from "./gateway/sse";
export { routeMessage } from "./gateway/router";
export { getAllTools } from "./tools";
export { CORE_TOOLS } from "./tools/core";

// Client-side (kept from scaffold)
export { parseSSEStream } from "./stream-parser";
export { useChatEngine } from "./use-chat-engine";
export type { ChatEngineState, UseChatEngineReturn } from "./use-chat-engine";
