CREATE TABLE "season_phase_clocks" (
	"season_id" uuid NOT NULL,
	"phase_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_answer_at" timestamp with time zone,
	CONSTRAINT "season_phase_clocks_season_id_phase_id_user_id_pk" PRIMARY KEY("season_id","phase_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "season_phase_clocks" ADD CONSTRAINT "season_phase_clocks_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_phase_clocks" ADD CONSTRAINT "season_phase_clocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;