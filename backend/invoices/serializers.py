from rest_framework import serializers


class ExtractNFSerializer(serializers.Serializer):
    fileBase64 = serializers.CharField()
    mediaType = serializers.CharField()
