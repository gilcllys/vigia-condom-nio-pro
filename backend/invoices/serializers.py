from rest_framework import serializers

from invoices.models import (
    FiscalDocument,
    FiscalDocumentApproval,
    FiscalDocumentItem,
    StockCategory,
    StockItem,
    StockMovement,
)


class ExtractNFSerializer(serializers.Serializer):
    fileBase64 = serializers.CharField()
    mediaType = serializers.CharField()


class FiscalDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalDocument
        fields = [
            "id", "condo_id", "service_order_id", "number",
            "amount", "gross_amount", "issue_date",
            "issuer_name", "supplier", "file_url",
            "source_type", "document_type", "status",
            "approval_status", "created_by", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class FiscalDocumentApprovalSerializer(serializers.ModelSerializer):
    fiscal_documents = FiscalDocumentSerializer(source="fiscal_document", read_only=True)

    class Meta:
        model = FiscalDocumentApproval
        fields = [
            "id", "fiscal_document_id", "condo_id",
            "approver_user_id", "approver_role",
            "decision", "voted_at", "justification",
            "created_at", "fiscal_documents",
        ]
        read_only_fields = ["id", "created_at"]


class FiscalDocumentItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalDocumentItem
        fields = ["id", "fiscal_document_id", "stock_item_id", "qty", "unit_price", "created_at"]
        read_only_fields = ["id", "created_at"]


class StockCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = StockCategory
        fields = ["id", "condo_id", "name", "description", "created_at"]
        read_only_fields = ["id", "created_at"]


class StockItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockItem
        fields = [
            "id", "condo_id", "category_id", "name",
            "description", "unit", "min_qty", "current_qty",
            "deleted_at", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class StockMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMovement
        fields = [
            "id", "condo_id", "item_id", "move_type",
            "qty", "service_order_id",
            "service_order_material_id", "fiscal_document_id",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]
