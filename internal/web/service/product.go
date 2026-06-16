package service

import (
	"errors"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/database"
	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

// Errors returned by ProductService.
var (
	ErrProductNotFound = errors.New("product not found")
	ErrInvalidProduct  = errors.New("invalid product")
)

// ProductService manages the sellable product catalog. Catalog mutation is an
// admin/moderator capability (enforced by the controller via RequirePermission);
// this layer only validates and persists.
type ProductService struct{}

// ProductInput is the create/update payload for a product.
type ProductInput struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	TrafficLimit int64  `json:"trafficLimit"`
	DurationDays int    `json:"durationDays"`
	Price        int64  `json:"price"`
	Audience     string `json:"audience"`
	InboundIds   []int  `json:"inboundIds"`
	Status       string `json:"status"`
}

func normalizeProductStatus(s string) string {
	if strings.ToLower(strings.TrimSpace(s)) == model.ProductInactive {
		return model.ProductInactive
	}
	return model.ProductActive
}

// normalizeProductAudience maps any input to a known audience, defaulting to
// "all" so an unset/unknown value keeps the product visible to everyone.
func normalizeProductAudience(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case model.ProductAudienceReseller:
		return model.ProductAudienceReseller
	case model.ProductAudienceMember:
		return model.ProductAudienceMember
	default:
		return model.ProductAudienceAll
	}
}

// ProductAudienceAllows reports whether a product offered to `audience` may be
// seen/purchased by a buyer of the given canonical role. "all" is open to
// everyone; otherwise the audience must equal the buyer's role.
func ProductAudienceAllows(audience, role string) bool {
	a := normalizeProductAudience(audience)
	return a == model.ProductAudienceAll || a == model.NormalizeRole(role)
}

func validateProductInput(in ProductInput) error {
	if n := len(strings.TrimSpace(in.Name)); n < 1 || n > 200 {
		return ErrInvalidProduct
	}
	if len(in.Description) > 2000 {
		return ErrInvalidProduct
	}
	if in.Price < 0 || in.TrafficLimit < 0 || in.DurationDays < 0 {
		return ErrInvalidProduct
	}
	return nil
}

// List returns the catalog. When activeOnly is true only active products are
// returned (the store view for buyers); otherwise every product is returned
// (the management view for admin/moderator). When audience is non-empty the
// result is restricted to products offered to "all" or to that audience role,
// so a reseller/member only sees products targeted at them.
func (s *ProductService) List(activeOnly bool, audience string) ([]model.Product, error) {
	var products []model.Product
	q := database.GetDB().Model(&model.Product{}).Order("id DESC")
	if activeOnly {
		q = q.Where("status = ?", model.ProductActive)
	}
	if audience != "" {
		q = q.Where("audience IN ?", []string{model.ProductAudienceAll, audience})
	}
	if err := q.Find(&products).Error; err != nil {
		return nil, err
	}
	return products, nil
}

// Get loads a single product by id.
func (s *ProductService) Get(id int) (*model.Product, error) {
	var p model.Product
	if err := database.GetDB().Where("id = ?", id).First(&p).Error; err != nil {
		return nil, ErrProductNotFound
	}
	return &p, nil
}

// Create validates and persists a new product, stamping the creator id.
func (s *ProductService) Create(in ProductInput, createdBy int) (*model.Product, error) {
	if err := validateProductInput(in); err != nil {
		return nil, err
	}
	p := &model.Product{
		Name:         strings.TrimSpace(in.Name),
		Description:  strings.TrimSpace(in.Description),
		TrafficLimit: in.TrafficLimit,
		DurationDays: in.DurationDays,
		Price:        in.Price,
		Audience:     normalizeProductAudience(in.Audience),
		InboundIds:   model.IntList(in.InboundIds),
		Status:       normalizeProductStatus(in.Status),
		CreatedBy:    createdBy,
	}
	if err := database.GetDB().Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

// Update replaces a product's mutable fields.
func (s *ProductService) Update(id int, in ProductInput) (*model.Product, error) {
	if err := validateProductInput(in); err != nil {
		return nil, err
	}
	p, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{
		"name":          strings.TrimSpace(in.Name),
		"description":   strings.TrimSpace(in.Description),
		"traffic_limit": in.TrafficLimit,
		"duration_days": in.DurationDays,
		"price":         in.Price,
		"audience":      normalizeProductAudience(in.Audience),
		"inbound_ids":   model.IntList(in.InboundIds),
		"status":        normalizeProductStatus(in.Status),
	}
	if err := database.GetDB().Model(&model.Product{}).Where("id = ?", p.Id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

// SetStatus activates or deactivates a product without touching other fields.
func (s *ProductService) SetStatus(id int, active bool) error {
	status := model.ProductInactive
	if active {
		status = model.ProductActive
	}
	res := database.GetDB().Model(&model.Product{}).Where("id = ?", id).Update("status", status)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrProductNotFound
	}
	return nil
}

// Delete removes a product from the catalog. Existing orders keep their
// captured amount/snapshot, so deleting a product never rewrites order history.
func (s *ProductService) Delete(id int) error {
	res := database.GetDB().Where("id = ?", id).Delete(&model.Product{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrProductNotFound
	}
	return nil
}
