import { createDatabaseService } from "./databaseService.js";
import { createActivityService } from "./activityService.js";
import { createUserService } from "./userService.js";
import { createMemoryService } from "./memoryService.js";
import { createScreenshotService } from "./screenshotService.js";
import { createVoiceNoteService } from "./voiceNoteService.js";
import { createPlaceService, createTimelineService, createGoalService } from "./placeService.js";
import { createChatService } from "./chatService.js";
import { createAdminSyncService } from "./adminSyncService.js";
import { createModerationService } from "./moderationService.js";
import { createLiveMonitorService } from "./liveMonitorService.js";
import { createSupabaseProductionStore } from "./supabaseProductionStore.js";
export * from "./securityService.js";

export function createNeuroNestWarehouse(options = {}) {
  const databaseService = createDatabaseService(options);
  const activityService = createActivityService({ databaseService });
  const userService = createUserService({ databaseService, activityService });
  const memoryService = createMemoryService({ databaseService, activityService });
  const screenshotService = createScreenshotService({ databaseService, activityService });
  const voiceNoteService = createVoiceNoteService({ databaseService, activityService });
  const placeService = createPlaceService({ databaseService, activityService });
  const timelineService = createTimelineService({ databaseService });
  const goalService = createGoalService({ databaseService, activityService });
  const chatService = createChatService({ databaseService, activityService });
  const moderationService = createModerationService({ databaseService, activityService });
  const liveMonitorService = createLiveMonitorService({ databaseService, activityService });
  const adminSyncService = createAdminSyncService({
    databaseService,
    userService,
    memoryService,
    screenshotService,
    voiceNoteService,
    placeService,
    timelineService,
    goalService,
    chatService,
    activityService,
    moderationService,
  });
  const productionStore = createSupabaseProductionStore();

  function initialize() {
    const db = databaseService.readDb();
    adminSyncService.migrateLegacyData(db);
    databaseService.writeDb(db);
    return db;
  }

  function persistSync(mutator) {
    const db = databaseService.readDb();
    mutator(db);
    databaseService.writeDb(db);
    return db;
  }

  return {
    databaseService,
    activityService,
    userService,
    memoryService,
    screenshotService,
    voiceNoteService,
    placeService,
    timelineService,
    goalService,
    chatService,
    moderationService,
    liveMonitorService,
    adminSyncService,
    productionStore,
    initialize,
    persistSync,
  };
}

export {
  createDatabaseService,
  createActivityService,
  createUserService,
  createMemoryService,
  createScreenshotService,
  createVoiceNoteService,
  createPlaceService,
  createTimelineService,
  createGoalService,
  createChatService,
  createAdminSyncService,
  createModerationService,
  createLiveMonitorService,
  createSupabaseProductionStore,
};
