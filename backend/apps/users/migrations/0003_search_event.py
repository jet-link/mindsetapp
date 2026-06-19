# Generated manually for SearchEvent analytics model.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_alter_user_managers'),
    ]

    operations = [
        migrations.CreateModel(
            name='SearchEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tab', models.CharField(choices=[('themes', 'themes'), ('users', 'users')], db_index=True, max_length=10)),
                ('query_normalized', models.CharField(db_index=True, max_length=128)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='search_events', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ('-created_at',),
            },
        ),
        migrations.AddIndex(
            model_name='searchevent',
            index=models.Index(fields=['tab', 'query_normalized', '-created_at'], name='users_searc_tab_6a0f0d_idx'),
        ),
    ]
