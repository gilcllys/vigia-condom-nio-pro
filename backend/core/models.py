import uuid

from django.db import models


class Condo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    name = models.TextField(blank=True, null=True)
    invite_code = models.TextField(blank=True, null=True)
    invite_active = models.BooleanField(default=False)
    subscription_status = models.TextField(default="trial")
    subscription_id = models.TextField(blank=True, null=True)
    subscription_expires_at = models.DateTimeField(blank=True, null=True)
    pagarme_customer_id = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "condos"

    def __str__(self):
        return self.name or str(self.id)


class CondoFinancialConfig(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    condo = models.OneToOneField(Condo, on_delete=models.CASCADE, db_column="condo_id")
    annual_budget = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    approval_deadline_hours = models.IntegerField(default=48)
    notify_residents_above = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "condo_financial_config"


class User(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    auth_user_id = models.UUIDField(unique=True, blank=True, null=True)
    full_name = models.TextField(blank=True, null=True)
    email = models.TextField(blank=True, null=True)
    cpf_rg = models.TextField(blank=True, null=True)
    birth_date = models.DateField(blank=True, null=True)
    profile = models.TextField(blank=True, null=True, db_column="user_profile")
    status = models.TextField(blank=True, null=True)
    condo = models.ForeignKey(Condo, on_delete=models.SET_NULL, blank=True, null=True, db_column="condo_id")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "users"

    def __str__(self):
        return self.full_name or str(self.id)


class UserCondo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column="user_id")
    condo = models.ForeignKey(Condo, on_delete=models.CASCADE, db_column="condo_id")
    role = models.TextField()
    status = models.TextField(default="ativo")
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_condos"


class UserSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column="user_id")
    session_token = models.TextField()
    expires_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_sessions"


class Resident(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    condo = models.ForeignKey(Condo, on_delete=models.CASCADE, db_column="condo_id")
    full_name = models.TextField()
    document = models.TextField(blank=True, null=True)
    email = models.TextField(blank=True, null=True)
    phone = models.TextField(blank=True, null=True)
    block = models.TextField(blank=True, null=True)
    unit = models.TextField(blank=True, null=True)
    unit_label = models.TextField(blank=True, null=True)
    unit_id = models.TextField(blank=True, null=True)
    status = models.TextField(default="ativo")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "residents"


class ActivityLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    condo = models.ForeignKey(Condo, on_delete=models.CASCADE, db_column="condo_id")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, db_column="user_id")
    action = models.TextField()
    entity = models.TextField(blank=True, null=True)
    entity_id = models.UUIDField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "activity_logs"
