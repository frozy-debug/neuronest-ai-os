export function createUserService({ databaseService, activityService }) {
  function publicUserRecord(user, status = "active") {
    return {
      id: user.id,
      googleId: user.googleSub || "",
      name: user.name || user.email || "Unknown User",
      email: user.email || "",
      picture: user.picture || "",
      signupDate: user.createdAt || "",
      createdAt: user.createdAt || "",
      lastLogin: user.lastLoginAt || user.createdAt || "",
      lastLoginAt: user.lastLoginAt || user.createdAt || "",
      accountStatus: status,
    };
  }

  function syncUser(db, user, { isNew = false, silent = false } = {}) {
    if (!user?.id) return null;
    const status = db.adminUserStatus?.[user.id]?.status || "active";
    const profile = publicUserRecord(user, status);
    if (!silent) {
      activityService.logActivity(
        db,
        user.id,
        isNew ? activityService.ActivityActions.USER_REGISTERED : activityService.ActivityActions.USER_LOGIN,
        { email: user.email, name: user.name },
      );
    }
    return profile;
  }

  function getUserProfile(db, userId) {
    const user = db.users.find((item) => item.id === userId);
    if (!user) return null;
    const status = db.adminUserStatus?.[userId]?.status || "active";
    return publicUserRecord(user, status);
  }

  function listUsers(db) {
    return db.users.map((user) => {
      const status = db.adminUserStatus?.[user.id]?.status || "active";
      return publicUserRecord(user, status);
    });
  }

  return {
    syncUser,
    getUserProfile,
    listUsers,
    publicUserRecord,
  };
}
