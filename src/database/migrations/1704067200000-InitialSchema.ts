import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1704067200000 implements MigrationInterface {
  name = 'InitialSchema1704067200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "local_content" (
        "id" SERIAL NOT NULL,
        "cloudId" character varying NOT NULL,
        "title" character varying NOT NULL,
        "description" character varying,
        "htmlContent" text NOT NULL,
        "images" character varying,
        "localImages" character varying,
        "coverImageUrl" character varying,
        "language" character varying NOT NULL,
        "originalLanguage" character varying,
        "category" character varying NOT NULL,
        "author" character varying,
        "ageGroup" character varying,
        "targetCountries" character varying,
        "comprehensionQuestions" character varying,
        "contributorId" character varying,
        "cachedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP,
        CONSTRAINT "UQ_local_content_cloudId" UNIQUE ("cloudId"),
        CONSTRAINT "PK_local_content_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "local_devices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "deviceCode" character varying NOT NULL,
        "name" character varying,
        "status" character varying NOT NULL DEFAULT 'pending',
        "registeredAt" TIMESTAMP,
        "lastSeen" TIMESTAMP,
        "deviceInfo" text,
        "synced" boolean NOT NULL DEFAULT false,
        "cachedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_local_devices_deviceCode" UNIQUE ("deviceCode"),
        CONSTRAINT "PK_local_devices_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "local_activity" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sessionId" character varying NOT NULL,
        "contentId" character varying NOT NULL,
        "deviceId" character varying,
        "studentId" character varying,
        "timeSpent" integer NOT NULL,
        "quizScore" integer,
        "moduleCompleted" boolean NOT NULL DEFAULT false,
        "synced" boolean NOT NULL DEFAULT false,
        "eventData" text,
        "eventType" character varying,
        "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_local_activity_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "local_student" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cloudId" character varying,
        "name" character varying NOT NULL,
        "deviceId" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "synced" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_local_student_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "local_student"`);
    await queryRunner.query(`DROP TABLE "local_activity"`);
    await queryRunner.query(`DROP TABLE "local_devices"`);
    await queryRunner.query(`DROP TABLE "local_content"`);
  }
}