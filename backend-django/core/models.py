"""
Modèle de données TogoMobile, transcrit depuis backend/prisma/schema.prisma.

Les tables existent déjà (créées par les migrations Prisma) : managed = False, Django ne les crée
ni ne les modifie. Noms de tables et de colonnes identiques (camelCase entre guillemets côté SQL),
ce qui permet aux deux API de fonctionner sur la même base pendant la migration.

Montants : entiers en FCFA. Dates : timestamptz (UTC).
"""

from datetime import UTC

from django.db import models
from django.utils import timezone

from .ids import cuid


class UTCDateTimeField(models.DateTimeField):
    """
    Les colonnes DateTime de Prisma sont des « timestamp without time zone » qui contiennent de l'UTC.
    Relues ici comme des dates UTC, quel que soit le fuseau du serveur ; l'écriture se fait en UTC
    (Django fixe le fuseau de la connexion PostgreSQL à UTC).
    """

    def from_db_value(self, value, expression, connection):
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class Choices:
    ROLE = [('CUSTOMER', 'Client'), ('SELLER', 'Vendeur'), ('ADMIN', 'Administrateur')]
    USER_STATUS = [('ACTIVE', 'Actif'), ('SUSPENDED', 'Suspendu')]
    SHOP_STATUS = [
        ('PENDING', 'En attente'),
        ('CHANGES_REQUESTED', 'Corrections demandées'),
        ('ACTIVE', 'Active'),
        ('SUSPENDED', 'Suspendue'),
        ('CLOSED', 'Fermée'),
        ('REJECTED', 'Refusée'),
    ]
    CONDITION = [
        ('NEW', 'Neuf'),
        ('LIKE_NEW', 'Comme neuf'),
        ('REFURBISHED', 'Reconditionné'),
        ('USED_GOOD', 'Occasion, bon état'),
        ('USED_FAIR', 'Occasion, état correct'),
    ]
    AVAILABILITY = [
        ('AVAILABLE', 'Disponible'),
        ('OUT_OF_STOCK', 'Rupture'),
        ('TEMPORARILY_UNAVAILABLE', 'Indisponible'),
        ('WITHDRAWN', 'Retiré de la vente'),
    ]
    PUBLICATION = [('DRAFT', 'Brouillon'), ('PUBLISHED', 'Publié'), ('ARCHIVED', 'Archivé')]
    MODERATION = [('PENDING', 'En attente'), ('APPROVED', 'Approuvé'), ('REJECTED', 'Refusé')]
    MEDIA_TYPE = [('IMAGE', 'Image'), ('VIDEO', 'Vidéo')]
    MEDIA_STATUS = [('PROCESSING', 'Traitement'), ('READY', 'Prêt'), ('FAILED', 'Échec')]
    UPLOAD_STATUS = [('PENDING', 'En attente'), ('COMPLETED', 'Terminé'), ('EXPIRED', 'Expiré')]
    JOB_STATUS = [('PENDING', 'En attente'), ('RUNNING', 'En cours'), ('DONE', 'Terminé'), ('FAILED', 'Échec')]
    PROMOTION_STATUS = [('ACTIVE', 'Active'), ('DISABLED', 'Désactivée'), ('SUSPENDED', 'Suspendue')]
    SALE_STATUS = [
        ('DECLARED', 'Déclarée'),
        ('PENDING_VERIFICATION', 'À examiner'),
        ('VERIFIED', 'Vérifiée'),
        ('DISPUTED', 'Contestée'),
        ('CANCELLED', 'Annulée'),
    ]
    REVIEW_TOKEN_STATUS = [('ACTIVE', 'Actif'), ('USED', 'Utilisé'), ('REVOKED', 'Révoqué')]
    REVIEW_STATUS = [('PENDING', 'En attente'), ('PUBLISHED', 'Publié'), ('HIDDEN', 'Masqué'), ('REJECTED', 'Refusé')]
    REVIEW_VERIFICATION = [('VERIFIED_PURCHASE', 'Achat vérifié'), ('PENDING', 'En cours'), ('REVOKED', 'Révoqué')]
    REPORT_TARGET = [('PRODUCT', 'Produit'), ('SHOP', 'Boutique'), ('REVIEW', 'Avis'), ('PROMOTION', 'Promotion')]
    REPORT_STATUS = [('OPEN', 'Ouvert'), ('RESOLVED', 'Traité'), ('DISMISSED', 'Classé')]


def Id():
    return models.CharField(primary_key=True, max_length=40, default=cuid, editable=False)


def Created():
    return UTCDateTimeField(db_column='createdAt', default=timezone.now)


def Updated():
    return UTCDateTimeField(db_column='updatedAt', auto_now=True)


def Fk(to, column, on_delete=models.CASCADE, null=False, related_name='+'):
    return models.ForeignKey(to, models.DO_NOTHING if on_delete is None else on_delete, db_column=column, null=null, blank=null, related_name=related_name, db_constraint=False)


class Base(models.Model):
    class Meta:
        abstract = True
        managed = False


# ─── Comptes ────────────────────────────────────────────────────────────────


class User(Base):
    id = Id()
    name = models.TextField()
    email = models.TextField(null=True, unique=True)
    phone = models.TextField(null=True, unique=True)
    password_hash = models.TextField(db_column='passwordHash')
    role = models.TextField(choices=Choices.ROLE, default='CUSTOMER')
    status = models.TextField(choices=Choices.USER_STATUS, default='ACTIVE')
    is_demo = models.BooleanField(db_column='isDemo', default=False)
    failed_login_count = models.IntegerField(db_column='failedLoginCount', default=0)
    locked_until = UTCDateTimeField(db_column='lockedUntil', null=True)
    created_at = Created()
    updated_at = Updated()

    class Meta(Base.Meta):
        db_table = 'User'

    def __str__(self):
        return self.name


class Session(Base):
    id = Id()
    user = Fk(User, 'userId', related_name='sessions')
    token_hash = models.TextField(db_column='tokenHash', unique=True)
    user_agent = models.TextField(db_column='userAgent', null=True)
    created_at = Created()
    last_used_at = UTCDateTimeField(db_column='lastUsedAt', default=timezone.now)
    expires_at = UTCDateTimeField(db_column='expiresAt')
    revoked_at = UTCDateTimeField(db_column='revokedAt', null=True)

    class Meta(Base.Meta):
        db_table = 'Session'


class PasswordResetToken(Base):
    id = Id()
    user = Fk(User, 'userId')
    token_hash = models.TextField(db_column='tokenHash', unique=True)
    expires_at = UTCDateTimeField(db_column='expiresAt')
    used_at = UTCDateTimeField(db_column='usedAt', null=True)
    created_at = Created()

    class Meta(Base.Meta):
        db_table = 'PasswordResetToken'


# ─── Boutiques ──────────────────────────────────────────────────────────────


class Shop(Base):
    id = Id()
    owner = models.OneToOneField(User, models.PROTECT, db_column='ownerId', related_name='shop', db_constraint=False)
    name = models.TextField()
    slug = models.TextField(unique=True)
    description = models.TextField(null=True)
    logo_key = models.TextField(db_column='logoKey', null=True)
    city = models.TextField()
    district = models.TextField(null=True)
    address = models.TextField(null=True)
    phone = models.TextField(null=True)
    whatsapp = models.TextField()
    social_links = models.JSONField(db_column='socialLinks', default=dict)
    opening_hours = models.TextField(db_column='openingHours', null=True)
    status = models.TextField(choices=Choices.SHOP_STATUS, default='PENDING')
    status_reason = models.TextField(db_column='statusReason', null=True)
    validated_at = UTCDateTimeField(db_column='validatedAt', null=True)
    identity_verified_at = UTCDateTimeField(db_column='identityVerifiedAt', null=True)
    trusted_seller = models.BooleanField(db_column='trustedSeller', default=False)
    pending_changes = models.JSONField(db_column='pendingChanges', null=True)
    rating_avg = models.FloatField(db_column='ratingAvg', default=0)
    rating_count = models.IntegerField(db_column='ratingCount', default=0)
    is_demo = models.BooleanField(db_column='isDemo', default=False)
    created_at = Created()
    updated_at = Updated()

    class Meta(Base.Meta):
        db_table = 'Shop'

    def __str__(self):
        return self.name


# ─── Référentiels ───────────────────────────────────────────────────────────


class Brand(Base):
    id = Id()
    name = models.TextField(unique=True)
    slug = models.TextField(unique=True)
    logo_url = models.TextField(db_column='logoUrl', null=True)
    is_active = models.BooleanField(db_column='isActive', default=True)
    featured = models.BooleanField(default=False)
    sort_order = models.IntegerField(db_column='sortOrder', default=0)
    created_at = Created()
    updated_at = Updated()

    class Meta(Base.Meta):
        db_table = 'Brand'

    def __str__(self):
        return self.name


class Category(Base):
    id = Id()
    name = models.TextField()
    slug = models.TextField(unique=True)
    parent = Fk('self', 'parentId', models.SET_NULL, null=True, related_name='children')
    is_active = models.BooleanField(db_column='isActive', default=True)
    sort_order = models.IntegerField(db_column='sortOrder', default=0)
    created_at = Created()
    updated_at = Updated()

    class Meta(Base.Meta):
        db_table = 'Category'

    def __str__(self):
        return self.name


# ─── Produits ───────────────────────────────────────────────────────────────


class Product(Base):
    id = Id()
    reference = models.TextField(unique=True)
    slug = models.TextField(unique=True)
    shop = Fk(Shop, 'shopId', related_name='products')
    brand = Fk(Brand, 'brandId', models.PROTECT, related_name='products')
    category = Fk(Category, 'categoryId', models.SET_NULL, null=True, related_name='products')
    title = models.TextField()
    model = models.TextField()
    description = models.TextField(null=True)
    price = models.IntegerField()
    condition = models.TextField(choices=Choices.CONDITION)
    availability = models.TextField(choices=Choices.AVAILABILITY, default='AVAILABLE')
    stock = models.IntegerField(default=1)
    storage_gb = models.IntegerField(db_column='storageGb', null=True)
    ram_gb = models.IntegerField(db_column='ramGb', null=True)
    color = models.TextField(null=True)
    warranty = models.TextField(null=True)
    accessories = models.TextField(null=True)
    defects = models.TextField(null=True)
    specs = models.JSONField(default=dict)
    status = models.TextField(choices=Choices.PUBLICATION, default='DRAFT')
    moderation = models.TextField(choices=Choices.MODERATION, default='PENDING')
    moderation_note = models.TextField(db_column='moderationNote', null=True)
    moderated_at = UTCDateTimeField(db_column='moderatedAt', null=True)
    published_at = UTCDateTimeField(db_column='publishedAt', null=True)
    removed_at = UTCDateTimeField(db_column='removedAt', null=True)
    removal_reason = models.TextField(db_column='removalReason', null=True)
    search_text = models.TextField(db_column='searchText', default='')
    rating_avg = models.FloatField(db_column='ratingAvg', default=0)
    rating_count = models.IntegerField(db_column='ratingCount', default=0)
    view_count = models.IntegerField(db_column='viewCount', default=0)
    whatsapp_clicks = models.IntegerField(db_column='whatsappClicks', default=0)
    is_demo = models.BooleanField(db_column='isDemo', default=False)
    created_at = Created()
    updated_at = Updated()

    class Meta(Base.Meta):
        db_table = 'Product'

    def __str__(self):
        return self.title


class ProductMedia(Base):
    id = Id()
    product = Fk(Product, 'productId', related_name='media')
    shop = Fk(Shop, 'shopId')
    type = models.TextField(choices=Choices.MEDIA_TYPE)
    status = models.TextField(choices=Choices.MEDIA_STATUS, default='READY')
    key = models.TextField(unique=True)
    medium_key = models.TextField(db_column='mediumKey', null=True)
    thumb_key = models.TextField(db_column='thumbKey', null=True)
    poster_key = models.TextField(db_column='posterKey', null=True)
    original_key = models.TextField(db_column='originalKey', null=True)
    mime = models.TextField()
    size = models.IntegerField()
    width = models.IntegerField(null=True)
    height = models.IntegerField(null=True)
    duration_sec = models.FloatField(db_column='durationSec', null=True)
    transcoded = models.BooleanField(default=False)
    error = models.TextField(null=True)
    position = models.IntegerField(default=0)
    is_primary = models.BooleanField(db_column='isPrimary', default=False)
    created_at = Created()
    updated_at = Updated()

    class Meta(Base.Meta):
        db_table = 'ProductMedia'


class MediaUpload(Base):
    id = Id()
    product_id = models.TextField(db_column='productId')
    shop_id = models.TextField(db_column='shopId')
    user_id = models.TextField(db_column='userId')
    type = models.TextField(choices=Choices.MEDIA_TYPE)
    key = models.TextField(unique=True)
    mime = models.TextField()
    size = models.IntegerField()
    token_hash = models.TextField(db_column='tokenHash', null=True, unique=True)
    status = models.TextField(choices=Choices.UPLOAD_STATUS, default='PENDING')
    expires_at = UTCDateTimeField(db_column='expiresAt')
    created_at = Created()

    class Meta(Base.Meta):
        db_table = 'MediaUpload'


class Job(Base):
    """File de tâches dans PostgreSQL (verrouillage FOR UPDATE SKIP LOCKED)."""

    id = Id()
    type = models.TextField()
    payload = models.JSONField(default=dict)
    status = models.TextField(choices=Choices.JOB_STATUS, default='PENDING')
    attempts = models.IntegerField(default=0)
    max_attempts = models.IntegerField(db_column='maxAttempts', default=5)
    run_at = UTCDateTimeField(db_column='runAt', default=timezone.now)
    locked_at = UTCDateTimeField(db_column='lockedAt', null=True)
    locked_by = models.TextField(db_column='lockedBy', null=True)
    last_error = models.TextField(db_column='lastError', null=True)
    created_at = Created()
    updated_at = Updated()

    class Meta(Base.Meta):
        db_table = 'Job'


class HeroAd(Base):
    """Publicité affichée sur l'accueil, gérée par l'administration."""

    id = Id()
    title = models.TextField()
    subtitle = models.TextField(null=True)
    advertiser = models.TextField(null=True)
    link_url = models.TextField(db_column='linkUrl', null=True)
    image_key = models.TextField(db_column='imageKey')
    mobile_image_key = models.TextField(db_column='mobileImageKey')
    width = models.IntegerField()
    height = models.IntegerField()
    starts_at = UTCDateTimeField(db_column='startsAt', null=True)
    ends_at = UTCDateTimeField(db_column='endsAt', null=True)
    is_active = models.BooleanField(db_column='isActive', default=True)
    sort_order = models.IntegerField(db_column='sortOrder', default=0)
    created_by_id = models.TextField(db_column='createdById')
    created_at = Created()
    updated_at = Updated()

    class Meta(Base.Meta):
        db_table = 'HeroAd'


class StorageGarbage(Base):
    id = Id()
    key = models.TextField()
    attempts = models.IntegerField(default=0)
    created_at = Created()

    class Meta(Base.Meta):
        db_table = 'StorageGarbage'


class PriceHistory(Base):
    id = Id()
    product = Fk(Product, 'productId', related_name='price_history')
    price = models.IntegerField()
    changed_by = Fk(User, 'changedById', models.SET_NULL, null=True)
    created_at = Created()

    class Meta(Base.Meta):
        db_table = 'PriceHistory'


class ProductDailyStat(Base):
    pk = models.CompositePrimaryKey('product_id', 'day')
    product = Fk(Product, 'productId')
    day = models.DateField()
    views = models.IntegerField(default=0)
    whatsapp_clicks = models.IntegerField(db_column='whatsappClicks', default=0)

    class Meta(Base.Meta):
        db_table = 'ProductDailyStat'


# ─── Promotions ─────────────────────────────────────────────────────────────


class Promotion(Base):
    """Appliquée seulement entre startsAt (inclus) et endsAt (exclu), si ACTIVE."""

    id = Id()
    product = Fk(Product, 'productId', related_name='promotions')
    shop = Fk(Shop, 'shopId', related_name='promotions')
    promo_price = models.IntegerField(db_column='promoPrice')
    reference_price = models.IntegerField(db_column='referencePrice')
    starts_at = UTCDateTimeField(db_column='startsAt')
    ends_at = UTCDateTimeField(db_column='endsAt')
    status = models.TextField(choices=Choices.PROMOTION_STATUS, default='ACTIVE')
    conditions = models.TextField(null=True)
    status_reason = models.TextField(db_column='statusReason', null=True)
    is_demo = models.BooleanField(db_column='isDemo', default=False)
    created_at = Created()
    updated_at = Updated()

    class Meta(Base.Meta):
        db_table = 'Promotion'


class PromotionEvent(Base):
    id = Id()
    promotion = Fk(Promotion, 'promotionId', related_name='events')
    actor = Fk(User, 'actorId', models.SET_NULL, null=True)
    type = models.TextField()
    data = models.JSONField(default=dict)
    created_at = Created()

    class Meta(Base.Meta):
        db_table = 'PromotionEvent'


# ─── Favoris ────────────────────────────────────────────────────────────────


class ProductFavorite(Base):
    pk = models.CompositePrimaryKey('user_id', 'product_id')
    user = Fk(User, 'userId')
    product = Fk(Product, 'productId')
    created_at = Created()

    class Meta(Base.Meta):
        db_table = 'ProductFavorite'


class ShopFavorite(Base):
    pk = models.CompositePrimaryKey('user_id', 'shop_id')
    user = Fk(User, 'userId')
    shop = Fk(Shop, 'shopId')
    created_at = Created()

    class Meta(Base.Meta):
        db_table = 'ShopFavorite'


# ─── Ventes déclarées et avis ───────────────────────────────────────────────


class Sale(Base):
    id = Id()
    shop = Fk(Shop, 'shopId', related_name='sales')
    product = Fk(Product, 'productId', models.PROTECT)
    declared_by = Fk(User, 'declaredById', models.PROTECT)
    internal_ref = models.TextField(db_column='internalRef')
    sold_at = UTCDateTimeField(db_column='soldAt')
    amount = models.IntegerField(null=True)
    buyer_phone_hash = models.TextField(db_column='buyerPhoneHash', null=True)
    buyer_phone_hint = models.TextField(db_column='buyerPhoneHint', null=True)
    buyer = Fk(User, 'buyerId', models.SET_NULL, null=True)
    status = models.TextField(choices=Choices.SALE_STATUS, default='DECLARED')
    flags = models.JSONField(default=list)
    confirmed_at = UTCDateTimeField(db_column='confirmedAt', null=True)
    verified_at = UTCDateTimeField(db_column='verifiedAt', null=True)
    status_note = models.TextField(db_column='statusNote', null=True)
    is_demo = models.BooleanField(db_column='isDemo', default=False)
    created_at = Created()
    updated_at = Updated()

    class Meta(Base.Meta):
        db_table = 'Sale'


class ReviewToken(Base):
    id = Id()
    sale = Fk(Sale, 'saleId', related_name='tokens')
    token_hash = models.TextField(db_column='tokenHash', unique=True)
    status = models.TextField(choices=Choices.REVIEW_TOKEN_STATUS, default='ACTIVE')
    expires_at = UTCDateTimeField(db_column='expiresAt')
    used_at = UTCDateTimeField(db_column='usedAt', null=True)
    revoked_at = UTCDateTimeField(db_column='revokedAt', null=True)
    revoke_reason = models.TextField(db_column='revokeReason', null=True)
    failed_attempts = models.IntegerField(db_column='failedAttempts', default=0)
    created_at = Created()

    class Meta(Base.Meta):
        db_table = 'ReviewToken'


class Review(Base):
    id = Id()
    author = Fk(User, 'authorId', models.PROTECT)
    product = Fk(Product, 'productId', related_name='reviews')
    shop = Fk(Shop, 'shopId', related_name='reviews')
    sale = models.OneToOneField(Sale, models.PROTECT, db_column='saleId', related_name='review', db_constraint=False)
    rating = models.IntegerField()
    comment = models.TextField(null=True)
    comment_hash = models.TextField(db_column='commentHash', null=True)
    status = models.TextField(choices=Choices.REVIEW_STATUS, default='PENDING')
    verification = models.TextField(choices=Choices.REVIEW_VERIFICATION, default='PENDING')
    moderation_note = models.TextField(db_column='moderationNote', null=True)
    moderated_by = Fk(User, 'moderatedById', models.SET_NULL, null=True)
    moderated_at = UTCDateTimeField(db_column='moderatedAt', null=True)
    is_demo = models.BooleanField(db_column='isDemo', default=False)
    created_at = Created()
    updated_at = Updated()

    class Meta(Base.Meta):
        db_table = 'Review'


# ─── Signalements et audit ──────────────────────────────────────────────────


class Report(Base):
    id = Id()
    author = Fk(User, 'authorId')
    target_type = models.TextField(db_column='targetType', choices=Choices.REPORT_TARGET)
    target_id = models.TextField(db_column='targetId')
    reason = models.TextField()
    details = models.TextField(null=True)
    status = models.TextField(choices=Choices.REPORT_STATUS, default='OPEN')
    decision = models.TextField(null=True)
    handled_by = Fk(User, 'handledById', models.SET_NULL, null=True)
    handled_at = UTCDateTimeField(db_column='handledAt', null=True)
    created_at = Created()

    class Meta(Base.Meta):
        db_table = 'Report'


class AuditLog(Base):
    id = Id()
    actor = Fk(User, 'actorId', models.SET_NULL, null=True)
    action = models.TextField()
    target_type = models.TextField(db_column='targetType')
    target_id = models.TextField(db_column='targetId', null=True)
    metadata = models.JSONField(default=dict)
    created_at = Created()

    class Meta(Base.Meta):
        db_table = 'AuditLog'
