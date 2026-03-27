from rest_framework import serializers

from providers.models import Contract, Provider


class AnalyzeRiskSerializer(serializers.Serializer):
    cnpjData = serializers.DictField()


class ProviderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Provider
        fields = [
            "id", "condo_id", "cnpj", "company_name",
            "trade_name", "phone", "email", "address",
            "neighborhood", "city", "state", "zip_code",
            "service_type", "notes", "status", "risk_score",
            "deleted_at", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ContractSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contract
        fields = [
            "id", "condo_id", "provider_id", "title",
            "description", "contract_type", "value",
            "start_date", "end_date", "status",
            "created_by", "created_at",
        ]
        read_only_fields = ["id", "created_at"]
