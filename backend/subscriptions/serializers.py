from rest_framework import serializers


class CustomerSerializer(serializers.Serializer):
    name = serializers.CharField()
    email = serializers.EmailField()
    document = serializers.CharField()
    phone = serializers.CharField(required=False, default="")


class CreateSubscriptionSerializer(serializers.Serializer):
    card_token = serializers.CharField()
    condo_id = serializers.UUIDField()
    customer = CustomerSerializer()
