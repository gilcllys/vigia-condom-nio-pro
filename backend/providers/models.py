import uuid

from django.db import models


class Provider(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    condo = models.ForeignKey("core.Condo", on_delete=models.CASCADE, db_column="condo_id")
    cnpj = models.TextField(blank=True, null=True)
    company_name = models.TextField(blank=True, null=True)
    trade_name = models.TextField()
    phone = models.TextField(blank=True, null=True)
    email = models.TextField(blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    neighborhood = models.TextField(blank=True, null=True)
    city = models.TextField(blank=True, null=True)
    state = models.TextField(blank=True, null=True)
    zip_code = models.TextField(blank=True, null=True)
    service_type = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    status = models.TextField(default="ativo")
    risk_score = models.IntegerField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "providers"

    def __str__(self):
        return self.trade_name


class ProviderRiskAnalysis(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    provider = models.ForeignKey(Provider, on_delete=models.CASCADE, db_column="provider_id")
    score = models.IntegerField(default=0)
    risk_level = models.TextField(default="MEDIO")
    receita_status = models.TextField(blank=True, null=True)
    recommendation = models.TextField(blank=True, null=True)
    positive_points = models.JSONField(default=list)
    attention_points = models.JSONField(default=list)
    summary = models.TextField(blank=True, null=True)
    full_report = models.TextField(blank=True, null=True)
    cnpj_data = models.JSONField(blank=True, null=True)
    analyzed_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "provider_risk_analysis"


class Contract(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    condo = models.ForeignKey("core.Condo", on_delete=models.CASCADE, db_column="condo_id")
    provider = models.ForeignKey(Provider, on_delete=models.SET_NULL, null=True, blank=True, db_column="provider_id")
    title = models.TextField()
    description = models.TextField(blank=True, null=True)
    contract_type = models.TextField(default="SERVICO")
    value = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    status = models.TextField(default="RASCUNHO")
    created_by = models.UUIDField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "contracts"
