-- CreateTable
CREATE TABLE "roles" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL,
    "code_role" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "auth_method" TEXT NOT NULL DEFAULT 'local',
    "provider" TEXT,
    "provider_code" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "telegram" TEXT,
    "push_notification_token" TEXT,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "roleId" INTEGER NOT NULL,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" DATETIME,
    "email_verified_at" DATETIME,
    "otp_code" TEXT,
    "otp_expires_at" DATETIME,
    "otp_verified_at" DATETIME,
    "reset_password_token_hash" TEXT,
    "reset_password_token_expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME,
    CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "plans" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "plan" TEXT NOT NULL,
    "description" TEXT,
    "billing_interval" TEXT NOT NULL DEFAULT 'MENSUAL',
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVA',
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renews_at" DATETIME,
    "cancelled_at" DATETIME,
    "payment_gateway_ref" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "categories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "category_code" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME
);

-- CreateTable
CREATE TABLE "resources" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "preview_image_key" TEXT NOT NULL,
    "preview_image_size_bytes" INTEGER NOT NULL,
    "preview_image_mime_type" TEXT NOT NULL,
    "compressed_file_key" TEXT,
    "compressed_file_size_bytes" INTEGER,
    "compressed_file_type" TEXT,
    "thumbnails_generated_at" DATETIME,
    "visibility" TEXT NOT NULL DEFAULT 'PREMIUM',
    "uploaded_by_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME,
    CONSTRAINT "resources_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "resource_thumbnails" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "resource_id" INTEGER NOT NULL,
    "size" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "width_px" INTEGER,
    "height_px" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "resource_thumbnails_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "categories_resources" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "resource_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "categories_resources_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "categories_resources_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIA',
    "status" TEXT NOT NULL DEFAULT 'ABIERTO',
    "created_by_id" INTEGER NOT NULL,
    "resource_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tickets_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER,
    "user_id" INTEGER,
    "payload" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "global_variables" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "scope" TEXT,
    "value_type" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_role_key" ON "roles"("code_role");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_role_id" ON "users"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_provider_provider_code" ON "users"("provider", "provider_code");

-- CreateIndex
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_status" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "categories_category_key" ON "categories"("category");

-- CreateIndex
CREATE UNIQUE INDEX "categories_category_code_key" ON "categories"("category_code");

-- CreateIndex
CREATE INDEX "idx_resources_visibility" ON "resources"("visibility");

-- CreateIndex
CREATE INDEX "idx_resources_uploaded_by_id" ON "resources"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "idx_resource_thumbnails_resource_id" ON "resource_thumbnails"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_resource_thumbnails_resource_id_size" ON "resource_thumbnails"("resource_id", "size");

-- CreateIndex
CREATE INDEX "idx_categories_resources_category_id" ON "categories_resources"("category_id");

-- CreateIndex
CREATE INDEX "idx_categories_resources_resource_id" ON "categories_resources"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_categories_resources_resource_id_category_id" ON "categories_resources"("resource_id", "category_id");

-- CreateIndex
CREATE INDEX "idx_tickets_priority_status" ON "tickets"("priority", "status");

-- CreateIndex
CREATE INDEX "idx_tickets_created_by_id" ON "tickets"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_module" ON "audit_logs"("module");

-- CreateIndex
CREATE INDEX "idx_audit_logs_entity_type_entity_id" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "global_variables_key_key" ON "global_variables"("key");

-- CreateIndex
CREATE INDEX "idx_global_variables_scope" ON "global_variables"("scope");
