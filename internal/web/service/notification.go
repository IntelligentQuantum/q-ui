package service

import (
	"encoding/json"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/logger"
	"github.com/mhsanaei/3x-ui/v3/internal/web/websocket"
)

// NotificationService creates and reads per-user in-app notifications. Messages
// are stored as i18n keys + a params map so they render in each recipient's own
// UI language. Notification failures are best-effort: they are logged but never
// block the action that triggered them (e.g. a deposit still approves even if
// writing the notification fails).
type NotificationService struct{}

// createOne persists a single notification row (no broadcast).
func (s *NotificationService) createOne(userId int, title, body, level, link string, params map[string]any) error {
	if userId <= 0 {
		return nil
	}
	encoded := ""
	if len(params) > 0 {
		if b, err := json.Marshal(params); err == nil {
			encoded = string(b)
		}
	}
	n := &model.Notification{
		UserId: userId,
		Title:  title,
		Body:   body,
		Params: encoded,
		Level:  level,
		Link:   link,
	}
	if err := database.GetDB().Create(n).Error; err != nil {
		logger.Warning("notification: create failed:", err)
		return err
	}
	return nil
}

// Notify writes a single notification for one user and pushes a real-time nudge
// so the recipient's bell updates without a poll/refresh. params (may be nil) is
// the interpolation map for the title/body i18n keys.
func (s *NotificationService) Notify(userId int, title, body, level, link string, params map[string]any) error {
	err := s.createOne(userId, title, body, level, link, params)
	websocket.BroadcastNotificationsChanged()
	return err
}

// NotifyAdmins writes the same notification for every admin user (fan-out) and
// pushes a single real-time nudge. Used for events the operators must action,
// like a new manual deposit awaiting review.
func (s *NotificationService) NotifyAdmins(title, body, level, link string, params map[string]any) error {
	var ids []int
	if err := database.GetDB().Model(&model.User{}).
		Where("role = ?", model.RoleAdmin).Pluck("id", &ids).Error; err != nil {
		logger.Warning("notification: failed to load admins:", err)
		return err
	}
	for _, id := range ids {
		_ = s.createOne(id, title, body, level, link, params)
	}
	websocket.BroadcastNotificationsChanged()
	return nil
}

// NotifyUsers writes the same notification for a set of users (fan-out, e.g. all
// support staff) and pushes a single real-time nudge.
func (s *NotificationService) NotifyUsers(userIds []int, title, body, level, link string, params map[string]any) error {
	seen := make(map[int]bool, len(userIds))
	for _, id := range userIds {
		if id <= 0 || seen[id] {
			continue
		}
		seen[id] = true
		_ = s.createOne(id, title, body, level, link, params)
	}
	websocket.BroadcastNotificationsChanged()
	return nil
}

// ListForUser returns a user's notifications, newest first. limit is the page
// size the bell grows as the user clicks "load more" (capped to keep the bell
// payload bounded).
func (s *NotificationService) ListForUser(userId, limit int) ([]model.Notification, error) {
	if limit <= 0 {
		limit = 30
	}
	if limit > 200 {
		limit = 200
	}
	var rows []model.Notification
	err := database.GetDB().Where("user_id = ?", userId).
		Order("id desc").Limit(limit).Find(&rows).Error
	return rows, err
}

// UnreadCount returns how many unread notifications a user has.
func (s *NotificationService) UnreadCount(userId int) (int64, error) {
	var count int64
	err := database.GetDB().Model(&model.Notification{}).
		Where("user_id = ? AND read = ?", userId, false).Count(&count).Error
	return count, err
}

// MarkRead marks a single notification read, scoped to its owner so a user can
// never mutate another user's notifications.
func (s *NotificationService) MarkRead(userId, id int) error {
	return database.GetDB().Model(&model.Notification{}).
		Where("id = ? AND user_id = ?", id, userId).Update("read", true).Error
}

// MarkAllRead marks all of a user's notifications read.
func (s *NotificationService) MarkAllRead(userId int) error {
	return database.GetDB().Model(&model.Notification{}).
		Where("user_id = ? AND read = ?", userId, false).Update("read", true).Error
}
