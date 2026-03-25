from rest_framework import serializers


class AnalyzeRiskSerializer(serializers.Serializer):
    cnpjData = serializers.DictField()
