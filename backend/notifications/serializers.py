from rest_framework import serializers


class EmailContextSerializer(serializers.Serializer):
    title = serializers.CharField()
    amount = serializers.FloatField(required=False, allow_null=True)
    condo_name = serializers.CharField()


class SendApprovalEmailSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["NF", "OS_ORCAMENTO", "OS_FINAL", "CONTRATO"])
    approver_user_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)
    context = EmailContextSerializer()
