from rest_framework import serializers


class GenerateInviteSerializer(serializers.Serializer):
    condoId = serializers.UUIDField()
    action = serializers.ChoiceField(choices=["deactivate"], required=False, allow_null=True)
