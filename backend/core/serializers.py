from rest_framework import serializers

from core.models import (
    ActivityLog,
    Condo,
    CondoFinancialConfig,
    Resident,
    User,
    UserCondo,
    UserSession,
)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id", "auth_user_id", "full_name", "email",
            "cpf_rg", "birth_date", "profile", "status",
            "condo_id", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class UserSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSession
        fields = ["id", "user_id", "session_token", "expires_at", "created_at"]
        read_only_fields = ["id", "created_at"]


class CondoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Condo
        fields = [
            "id", "name", "invite_code", "invite_active",
            "subscription_status", "subscription_id",
            "subscription_expires_at", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class CondoFinancialConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = CondoFinancialConfig
        fields = [
            "id", "condo_id", "annual_budget",
            "approval_deadline_hours", "notify_residents_above",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ResidentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resident
        fields = [
            "id", "condo_id", "full_name", "document",
            "email", "phone", "block", "unit",
            "unit_label", "unit_id", "status", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class UserCondoSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserCondo
        fields = [
            "id", "user_id", "condo_id", "role",
            "status", "is_default", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ActivityLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityLog
        fields = [
            "id", "condo_id", "user_id", "action",
            "entity", "entity_id", "description", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ChangeRoleSerializer(serializers.Serializer):
    user_condo_id = serializers.UUIDField()
    new_role = serializers.CharField()


class SignupRegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()
    full_name = serializers.CharField()
    cpf_rg = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    birth_date = serializers.DateField(required=False, allow_null=True)
    condo_id = serializers.UUIDField()
    block = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    unit = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    unit_label = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    redirect_to = serializers.CharField(required=False, allow_blank=True, allow_null=True)
