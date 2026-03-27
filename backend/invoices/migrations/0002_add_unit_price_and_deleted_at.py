from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("invoices", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="fiscaldocumentitem",
            name="unit_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="stockitem",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="fiscaldocument",
            name="created_by",
            field=models.UUIDField(blank=True, null=True),
        ),
    ]
