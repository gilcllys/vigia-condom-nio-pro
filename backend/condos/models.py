import uuid

from django.db import models


class Ticket(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    condo = models.ForeignKey("core.Condo", on_delete=models.CASCADE, db_column="condo_id")
    title = models.TextField()
    description = models.TextField(blank=True, null=True)
    location = models.TextField(blank=True, null=True)
    category = models.TextField(blank=True, null=True)
    unit = models.TextField(blank=True, null=True)
    status = models.TextField(default="aberto")
    created_by = models.UUIDField(blank=True, null=True)
    close_reason = models.TextField(blank=True, null=True)
    service_order_id = models.UUIDField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tickets"


class ServiceOrder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    condo = models.ForeignKey("core.Condo", on_delete=models.CASCADE, db_column="condo_id")
    title = models.TextField()
    description = models.TextField(blank=True, null=True)
    location = models.TextField(blank=True, null=True)
    status = models.TextField(default="ABERTA")
    priority = models.TextField(default="MEDIA")
    is_emergency = models.BooleanField(default=False)
    executor_type = models.TextField(blank=True, null=True)
    provider = models.ForeignKey("providers.Provider", on_delete=models.SET_NULL, null=True, blank=True, db_column="provider_id")
    ticket = models.ForeignKey(Ticket, on_delete=models.SET_NULL, null=True, blank=True, db_column="ticket_id")
    final_pdf_url = models.TextField(blank=True, null=True)
    created_by = models.UUIDField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "service_orders"


class ServiceOrderPhoto(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    service_order = models.ForeignKey(ServiceOrder, on_delete=models.CASCADE, db_column="service_order_id")
    photo_type = models.TextField(blank=True, null=True)
    file_url = models.TextField()
    observation = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "service_order_photos"


class ServiceOrderMaterial(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    service_order = models.ForeignKey(ServiceOrder, on_delete=models.CASCADE, db_column="service_order_id")
    name = models.TextField()
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    unit = models.TextField(blank=True, null=True)
    cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "service_order_materials"


class ServiceOrderActivity(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    service_order = models.ForeignKey(ServiceOrder, on_delete=models.CASCADE, db_column="service_order_id")
    user = models.ForeignKey("core.User", on_delete=models.SET_NULL, null=True, db_column="user_id")
    activity_type = models.TextField()
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "service_order_activities"


class Approval(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    service_order = models.ForeignKey(ServiceOrder, on_delete=models.CASCADE, db_column="service_order_id")
    condo = models.ForeignKey("core.Condo", on_delete=models.CASCADE, db_column="condo_id")
    approver = models.ForeignKey("core.User", on_delete=models.CASCADE, db_column="approver_id")
    approver_role = models.TextField()
    approval_type = models.TextField()
    decision = models.TextField(default="pendente")
    justification = models.TextField(blank=True, null=True)
    expires_at = models.DateTimeField()
    responded_at = models.DateTimeField(blank=True, null=True)
    is_minerva = models.BooleanField(default=False)
    minerva_justification = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "approvals"


class Budget(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    service_order = models.ForeignKey(ServiceOrder, on_delete=models.CASCADE, db_column="service_order_id")
    condo = models.ForeignKey("core.Condo", on_delete=models.CASCADE, db_column="condo_id")
    provider = models.ForeignKey("providers.Provider", on_delete=models.SET_NULL, null=True, blank=True, db_column="provider_id")
    description = models.TextField()
    total_value = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.TextField(default="pendente")
    valid_until = models.DateField(blank=True, null=True)
    created_by_user = models.ForeignKey("core.User", on_delete=models.SET_NULL, null=True, blank=True, db_column="created_by_user_id")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "budgets"
