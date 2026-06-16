package model

type Referral struct {
	Id             int    `json:"id" gorm:"primaryKey;autoIncrement"`
	ResellerId     int    `json:"resellerId" gorm:"column:reseller_id;index;not null"`
	ReferredUserId int    `json:"referredUserId" gorm:"column:referred_user_id;uniqueIndex;not null"`
	ReferralCode   string `json:"referralCode" gorm:"column:referral_code;index;default:''"`
	CreatedAt      int64  `json:"createdAt" gorm:"column:created_at;autoCreateTime:milli"`
}

func (Referral) TableName() string { return "referrals" }
