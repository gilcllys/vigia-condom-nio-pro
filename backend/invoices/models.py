import uuid

from django.db import models


class FiscalDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    condo = models.ForeignKey("core.Condo", on_delete=models.CASCADE, db_column="condo_id")
    service_order_id = models.UUIDField(blank=True, null=True)
    number = models.TextField(blank=True, null=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    gross_amount = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    issue_date = models.DateField(blank=True, null=True)
    issuer_name = models.TextField(blank=True, null=True)
    supplier = models.TextField(blank=True, null=True)
    file_url = models.TextField(blank=True, null=True)
    source_type = models.TextField(blank=True, null=True)
    document_type = models.TextField(blank=True, null=True)
    status = models.TextField(default="pendente")
    approval_status = models.TextField(default="pendente")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fiscal_documents"


class FiscalDocumentApproval(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    fiscal_document = models.ForeignKey(FiscalDocument, on_delete=models.CASCADE, db_column="fiscal_document_id")
    condo = models.ForeignKey("core.Condo", on_delete=models.CASCADE, db_column="condo_id")
    approver_user = models.ForeignKey("core.User", on_delete=models.CASCADE, db_column="approver_user_id")
    approver_role = models.TextField()
    decision = models.TextField(default="pendente")
    voted_at = models.DateTimeField(blank=True, null=True)
    justification = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fiscal_document_approvals"


class FiscalDocumentItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    fiscal_document = models.ForeignKey(FiscalDocument, on_delete=models.CASCADE, db_column="fiscal_document_id")
    stock_item_id = models.UUIDField(blank=True, null=True)
    qty = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fiscal_document_items"


class StockCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    condo = models.ForeignKey("core.Condo", on_delete=models.CASCADE, db_column="condo_id")
    name = models.TextField()
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "stock_categories"


class StockItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    condo = models.ForeignKey("core.Condo", on_delete=models.CASCADE, db_column="condo_id")
    category = models.ForeignKey(StockCategory, on_delete=models.SET_NULL, null=True, blank=True, db_column="category_id")
    name = models.TextField()
    description = models.TextField(blank=True, null=True)
    unit = models.TextField(blank=True, null=True)
    min_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    current_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "stock_items"


class StockMovement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    condo = models.ForeignKey("core.Condo", on_delete=models.CASCADE, db_column="condo_id")
    item = models.ForeignKey(StockItem, on_delete=models.CASCADE, db_column="item_id")
    move_type = models.TextField()
    qty = models.DecimalField(max_digits=12, decimal_places=2)
    service_order_id = models.UUIDField(blank=True, null=True)
    service_order_material_id = models.UUIDField(blank=True, null=True)
    fiscal_document_id = models.UUIDField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "stock_movements"
