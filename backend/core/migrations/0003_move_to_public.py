from django.db import migrations


class Migration(migrations.Migration):
    """Move all tables and functions from schema nfe_vigia to public."""

    dependencies = [
        ("core", "0002_initial"),
        ("condos", "0001_initial"),
        ("invoices", "0002_add_unit_price_and_deleted_at"),
        ("providers", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                -- Move tables
                DO $$
                DECLARE
                    tbl TEXT;
                BEGIN
                    FOR tbl IN
                        SELECT tablename FROM pg_tables WHERE schemaname = 'nfe_vigia'
                    LOOP
                        EXECUTE format('ALTER TABLE nfe_vigia.%I SET SCHEMA public', tbl);
                    END LOOP;
                END $$;

                -- Move functions
                DO $$
                DECLARE
                    rec RECORD;
                BEGIN
                    FOR rec IN
                        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
                        FROM pg_proc p
                        JOIN pg_namespace n ON p.pronamespace = n.oid
                        WHERE n.nspname = 'nfe_vigia'
                    LOOP
                        EXECUTE format(
                            'ALTER FUNCTION nfe_vigia.%I(%s) SET SCHEMA public',
                            rec.proname, rec.args
                        );
                    END LOOP;
                END $$;

                -- Move sequences
                DO $$
                DECLARE
                    seq TEXT;
                BEGIN
                    FOR seq IN
                        SELECT sequence_name FROM information_schema.sequences
                        WHERE sequence_schema = 'nfe_vigia'
                    LOOP
                        EXECUTE format('ALTER SEQUENCE nfe_vigia.%I SET SCHEMA public', seq);
                    END LOOP;
                END $$;

                -- Move types/enums
                DO $$
                DECLARE
                    rec RECORD;
                BEGIN
                    FOR rec IN
                        SELECT t.typname
                        FROM pg_type t
                        JOIN pg_namespace n ON t.typnamespace = n.oid
                        WHERE n.nspname = 'nfe_vigia'
                          AND t.typtype = 'e'
                    LOOP
                        EXECUTE format('ALTER TYPE nfe_vigia.%I SET SCHEMA public', rec.typname);
                    END LOOP;
                END $$;

                -- Drop the now-empty schema
                DROP SCHEMA IF EXISTS nfe_vigia CASCADE;
            """,
            reverse_sql="""
                CREATE SCHEMA IF NOT EXISTS nfe_vigia;
            """,
        ),
    ]
