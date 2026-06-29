package handlers

import (
	"reflect"
	"testing"
)

// TestUserOwnedModelsHaveUserID guards the DeleteUser registry: every entry must be
// a distinct struct with a UserID field, so the registry can only contain genuinely
// user-keyed tables. A wrong entry (or a duplicate) fails the build's test step.
func TestUserOwnedModelsHaveUserID(t *testing.T) {
	seen := map[string]bool{}
	for _, m := range userOwnedModels {
		typ := reflect.TypeOf(m)
		for typ.Kind() == reflect.Ptr {
			typ = typ.Elem()
		}
		if typ.Kind() != reflect.Struct {
			t.Fatalf("userOwnedModels entry %v is not a struct", typ)
		}
		if seen[typ.Name()] {
			t.Fatalf("duplicate userOwnedModels entry %s", typ.Name())
		}
		seen[typ.Name()] = true
		if _, ok := typ.FieldByName("UserID"); !ok {
			t.Fatalf("userOwnedModels entry %s has no UserID field — it should not be in the registry", typ.Name())
		}
	}
}
