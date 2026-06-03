export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alert_dismissals: {
        Row: {
          alert_key: string
          dismissed_at: string
          id: string
          owner_id: string
        }
        Insert: {
          alert_key: string
          dismissed_at?: string
          id?: string
          owner_id: string
        }
        Update: {
          alert_key?: string
          dismissed_at?: string
          id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_dismissals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      call_schedule: {
        Row: {
          coach_id: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          scheduled_date: string
          status: string
          student_id: string
        }
        Insert: {
          coach_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_date: string
          status?: string
          student_id: string
        }
        Update: {
          coach_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_date?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_schedule_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_schedule_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_plans: {
        Row: {
          created_at: string
          date: string
          id: string
          plan_json: Json
          student_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          plan_json: Json
          student_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          plan_json?: Json
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          brands_contacted: number
          calls_joined: number
          created_at: string
          date: string
          hours_worked: number
          id: string
          improvements: string | null
          influencers_contacted: number
          outreach_count: number
          reviewed_at: string | null
          reviewed_by: string | null
          star_rating: number | null
          student_id: string
          submitted_at: string | null
          wins: string | null
        }
        Insert: {
          brands_contacted?: number
          calls_joined?: number
          created_at?: string
          date: string
          hours_worked?: number
          id?: string
          improvements?: string | null
          influencers_contacted?: number
          outreach_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          star_rating?: number | null
          student_id: string
          submitted_at?: string | null
          wins?: string | null
        }
        Update: {
          brands_contacted?: number
          calls_joined?: number
          created_at?: string
          date?: string
          hours_worked?: number
          id?: string
          improvements?: string | null
          influencers_contacted?: number
          outreach_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          star_rating?: number | null
          student_id?: string
          submitted_at?: string | null
          wins?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          created_at: string
          deal_number: number
          id: string
          logged_by: string
          profit: number
          revenue: number
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          // HAND-EDIT: deal_number assigned by BEFORE INSERT trigger — reapply after regen.
          deal_number?: number
          id?: string
          logged_by: string
          profit: number
          revenue: number
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          deal_number?: number
          id?: string
          logged_by?: string
          profit?: number
          revenue?: number
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      glossary_terms: {
        Row: {
          created_at: string
          created_by: string
          definition: string
          id: string
          term: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          definition: string
          id?: string
          term: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: string
          id?: string
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "glossary_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      influencers: {
        Row: {
          created_at: string
          followers: number | null
          id: string
          influencer_name: string
          platform: string | null
          signed_at: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          followers?: number | null
          id?: string
          influencer_name: string
          platform?: string | null
          signed_at?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          followers?: number | null
          id?: string
          influencer_name?: string
          platform?: string | null
          signed_at?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "influencers_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          coach_id: string | null
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          used: boolean
          used_at: string | null
        }
        Insert: {
          coach_id?: string | null
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role: string
          used?: boolean
          used_at?: string | null
        }
        Update: {
          coach_id?: string | null
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          used?: boolean
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      magic_links: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          role: string
          use_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          role: string
          use_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          role?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "magic_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          id: string
          message: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_log: {
        Row: {
          called_at: string
          endpoint: string
          id: number
          user_id: string
        }
        Insert: {
          called_at?: string
          endpoint: string
          id?: number
          user_id: string
        }
        Update: {
          called_at?: string
          endpoint?: string
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_comments: {
        Row: {
          coach_id: string
          comment: string
          created_at: string
          id: string
          report_id: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          comment: string
          created_at?: string
          id?: string
          report_id: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          comment?: string
          created_at?: string
          id?: string
          report_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_comments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string
          id: string
          is_pinned: boolean
          title: string
          url: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_pinned?: boolean
          title: string
          url: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_pinned?: boolean
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          // HAND-EDIT: narrow from DB CHECK constraint — reapply after regen.
          status: "locked" | "active" | "completed"
          step_name: string
          step_number: number
          student_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          status?: "locked" | "active" | "completed"
          step_name: string
          step_number: number
          student_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          status?: "locked" | "active" | "completed"
          step_name?: string
          step_number?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_undo_log: {
        Row: {
          actor_id: string
          actor_role: string
          id: string
          step_number: number
          student_id: string
          undone_at: string
        }
        Insert: {
          actor_id: string
          actor_role: string
          id?: string
          step_number: number
          student_id: string
          undone_at?: string
        }
        Update: {
          actor_id?: string
          actor_role?: string
          id?: string
          step_number?: number
          student_id?: string
          undone_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_undo_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_undo_log_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      student_kpi_summaries: {
        Row: {
          current_streak: number
          last_active_date: string | null
          last_report_date: string | null
          student_id: string
          total_brands_contacted: number
          total_calls_joined: number
          total_hours_worked: number
          total_influencers_contacted: number
          total_reports: number
          updated_at: string
        }
        Insert: {
          current_streak?: number
          last_active_date?: string | null
          last_report_date?: string | null
          student_id: string
          total_brands_contacted?: number
          total_calls_joined?: number
          total_hours_worked?: number
          total_influencers_contacted?: number
          total_reports?: number
          updated_at?: string
        }
        Update: {
          current_streak?: number
          last_active_date?: string | null
          last_report_date?: string | null
          student_id?: string
          total_brands_contacted?: number
          total_calls_joined?: number
          total_hours_worked?: number
          total_influencers_contacted?: number
          total_reports?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_kpi_summaries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_id: string | null
          coach_id: string | null
          created_at: string
          email: string
          id: string
          joined_at: string
          last_active_at: string | null
          name: string
          niche: string | null
          referral_code: string | null
          referral_short_url: string | null
          // HAND-EDIT: narrow from DB CHECK constraint — reapply after regen.
          role: "owner" | "coach" | "student" | "student_diy"
          status: "active" | "inactive" | "suspended"
          streak_count: number
          updated_at: string
        }
        Insert: {
          auth_id?: string | null
          coach_id?: string | null
          created_at?: string
          email: string
          id?: string
          joined_at?: string
          last_active_at?: string | null
          name: string
          niche?: string | null
          referral_code?: string | null
          referral_short_url?: string | null
          role: "owner" | "coach" | "student" | "student_diy"
          status?: "active" | "inactive" | "suspended"
          streak_count?: number
          updated_at?: string
        }
        Update: {
          auth_id?: string | null
          coach_id?: string | null
          created_at?: string
          email?: string
          id?: string
          joined_at?: string
          last_active_at?: string | null
          name?: string
          niche?: string | null
          referral_code?: string | null
          referral_short_url?: string | null
          role?: "owner" | "coach" | "student" | "student_diy"
          status?: "active" | "inactive" | "suspended"
          streak_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      // HAND-EDIT: added in migration 00045_push_subscriptions.sql — reapply after regen.
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          student_id: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          student_id: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          student_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      work_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          cycle_number: number
          date: string
          duration_minutes: number
          id: string
          paused_at: string | null
          session_minutes: number
          started_at: string
          // HAND-EDIT: narrow from DB CHECK constraint — reapply after regen.
          status: "pending" | "in_progress" | "completed" | "abandoned" | "paused"
          student_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          cycle_number: number
          date: string
          duration_minutes?: number
          id?: string
          paused_at?: string | null
          session_minutes: number
          started_at: string
          status?: "pending" | "in_progress" | "completed" | "abandoned" | "paused"
          student_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          cycle_number?: number
          date?: string
          duration_minutes?: number
          id?: string
          paused_at?: string | null
          session_minutes?: number
          started_at?: string
          status?: "pending" | "in_progress" | "completed" | "abandoned" | "paused"
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_coach_analytics: {
        Args: {
          p_coach_id: string
          p_leaderboard_limit?: number
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort?: string
          p_today?: string
          p_window_days?: number
        }
        Returns: Json
      }
      get_coach_dashboard: {
        Args: { p_coach_id: string; p_today?: string; p_week_start?: string }
        Returns: Json
      }
      get_coach_milestones: {
        Args: {
          p_coach_id: string
          p_tech_setup_enabled?: boolean
          p_today?: string
        }
        Returns: Json
      }
      get_coach_performance_summary: { Args: never; Returns: Json }
      get_leaderboard: {
        Args: { p_period_start: string; p_top_n?: number }
        Returns: Json
      }
      get_owner_analytics: { Args: never; Returns: Json }
      get_owner_dashboard_stats: { Args: never; Returns: Json }
      get_platform_stats: { Args: never; Returns: Json }
      get_sidebar_badges:
        | { Args: { p_role: string; p_user_id: string }; Returns: Json }
        | {
            Args: {
              p_role: string
              p_tech_setup_enabled?: boolean
              p_today?: string
              p_user_id: string
            }
            Returns: Json
          }
      get_student_analytics: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_range?: string
          p_student_id: string
        }
        Returns: Json
      }
      get_student_detail: {
        Args: {
          p_include_coach_mgmt?: boolean
          p_month_end: string
          p_month_start: string
          p_student_id: string
        }
        Returns: Json
      }
      get_student_summary: {
        Args: { p_period_start: string; p_student_id: string }
        Returns: Json
      }
      get_tier_distribution: { Args: never; Returns: Json }
      get_user_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      get_weekly_skip_counts: {
        Args: {
          p_current_hour: number
          p_student_ids: string[]
          p_today: string
        }
        Returns: Json
      }
      refresh_student_kpi_summaries: { Args: never; Returns: undefined }
      student_activity_status: {
        Args: { p_student_id: string; p_today: string }
        Returns: string
      }
      week_start: { Args: { p_today: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
