export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      affinity_preferences: {
        Row: {
          created_at: string;
          id: string;
          preference_level: Database["public"]["Enums"]["affinity_level"];
          target_user_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          preference_level?: Database["public"]["Enums"]["affinity_level"];
          target_user_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          preference_level?: Database["public"]["Enums"]["affinity_level"];
          target_user_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
          extend_to_network: boolean;
          id: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
          extend_to_network?: boolean;
          id?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
          extend_to_network?: boolean;
          id?: string;
        };
        Relationships: [];
      };
      concert_group_chat_members: {
        Row: {
          group_chat_id: string;
          id: string;
          joined_at: string;
          left_at: string | null;
          user_id: string;
        };
        Insert: {
          group_chat_id: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          user_id: string;
        };
        Update: {
          group_chat_id?: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "concert_group_chat_members_group_chat_id_fkey";
            columns: ["group_chat_id"];
            isOneToOne: false;
            referencedRelation: "concert_group_chats";
            referencedColumns: ["id"];
          },
        ];
      };
      concert_group_chats: {
        Row: {
          closes_at: string | null;
          concert_id: string;
          created_at: string;
          id: string;
          status: Database["public"]["Enums"]["group_chat_status"];
          updated_at: string;
        };
        Insert: {
          closes_at?: string | null;
          concert_id: string;
          created_at?: string;
          id?: string;
          status?: Database["public"]["Enums"]["group_chat_status"];
          updated_at?: string;
        };
        Update: {
          closes_at?: string | null;
          concert_id?: string;
          created_at?: string;
          id?: string;
          status?: Database["public"]["Enums"]["group_chat_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "concert_group_chats_concert_id_fkey";
            columns: ["concert_id"];
            isOneToOne: false;
            referencedRelation: "concerts";
            referencedColumns: ["id"];
          },
        ];
      };
      concert_intents: {
        Row: {
          companion_count: number | null;
          companion_mode: string | null;
          concert_id: string | null;
          concert_slug: string;
          created_at: string;
          id: string;
          join_group_chat: boolean;
          user_id: string;
        };
        Insert: {
          companion_count?: number | null;
          companion_mode?: string | null;
          concert_id?: string | null;
          concert_slug: string;
          created_at?: string;
          id?: string;
          join_group_chat?: boolean;
          user_id: string;
        };
        Update: {
          companion_count?: number | null;
          companion_mode?: string | null;
          concert_id?: string | null;
          concert_slug?: string;
          created_at?: string;
          id?: string;
          join_group_chat?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "concert_intents_concert_id_fkey";
            columns: ["concert_id"];
            isOneToOne: false;
            referencedRelation: "concerts";
            referencedColumns: ["id"];
          },
        ];
      };
      concert_logs: {
        Row: {
          created_at: string;
          favourite_moment: string | null;
          id: string;
          notes: string | null;
          rating: number | null;
          updated_at: string;
          user_concert_id: string;
          user_id: string;
          visibility: string;
        };
        Insert: {
          created_at?: string;
          favourite_moment?: string | null;
          id?: string;
          notes?: string | null;
          rating?: number | null;
          updated_at?: string;
          user_concert_id: string;
          user_id: string;
          visibility?: string;
        };
        Update: {
          created_at?: string;
          favourite_moment?: string | null;
          id?: string;
          notes?: string | null;
          rating?: number | null;
          updated_at?: string;
          user_concert_id?: string;
          user_id?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "concert_logs_user_concert_id_fkey";
            columns: ["user_concert_id"];
            isOneToOne: true;
            referencedRelation: "user_concerts";
            referencedColumns: ["id"];
          },
        ];
      };
      concerts: {
        Row: {
          booking_url: string | null;
          capacity: number;
          city: string | null;
          concert_at: string;
          created_at: string;
          description: string | null;
          external_id: string | null;
          genre: string;
          id: string;
          lat: number | null;
          lng: number | null;
          location: string;
          meeting_details: string | null;
          name: string;
          source: string | null;
          ticket_price_max_pence: number | null;
          ticket_price_pence: number;
          updated_at: string;
          venue: string;
        };
        Insert: {
          booking_url?: string | null;
          capacity?: number;
          city?: string | null;
          concert_at: string;
          created_at?: string;
          description?: string | null;
          external_id?: string | null;
          genre: string;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          location: string;
          meeting_details?: string | null;
          name: string;
          source?: string | null;
          ticket_price_max_pence?: number | null;
          ticket_price_pence?: number;
          updated_at?: string;
          venue: string;
        };
        Update: {
          booking_url?: string | null;
          capacity?: number;
          city?: string | null;
          concert_at?: string;
          created_at?: string;
          description?: string | null;
          external_id?: string | null;
          genre?: string;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          location?: string;
          meeting_details?: string | null;
          name?: string;
          source?: string | null;
          ticket_price_max_pence?: number | null;
          ticket_price_pence?: number;
          updated_at?: string;
          venue?: string;
        };
        Relationships: [];
      };
      follows: {
        Row: {
          created_at: string;
          followed_id: string;
          follower_id: string;
        };
        Insert: {
          created_at?: string;
          followed_id: string;
          follower_id: string;
        };
        Update: {
          created_at?: string;
          followed_id?: string;
          follower_id?: string;
        };
        Relationships: [];
      };
      group_chat_messages: {
        Row: {
          body: string;
          created_at: string;
          group_chat_id: string;
          id: string;
          is_system: boolean;
          sender_id: string | null;
        };
        Insert: {
          body: string;
          created_at?: string;
          group_chat_id: string;
          id?: string;
          is_system?: boolean;
          sender_id?: string | null;
        };
        Update: {
          body?: string;
          created_at?: string;
          group_chat_id?: string;
          id?: string;
          is_system?: boolean;
          sender_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "group_chat_messages_group_chat_id_fkey";
            columns: ["group_chat_id"];
            isOneToOne: false;
            referencedRelation: "concert_group_chats";
            referencedColumns: ["id"];
          },
        ];
      };
      log_comments: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          log_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          log_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          log_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "log_comments_log_id_fkey";
            columns: ["log_id"];
            isOneToOne: false;
            referencedRelation: "concert_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      log_reactions: {
        Row: {
          created_at: string;
          id: string;
          log_id: string;
          reaction: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          log_id: string;
          reaction?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          log_id?: string;
          reaction?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "log_reactions_log_id_fkey";
            columns: ["log_id"];
            isOneToOne: false;
            referencedRelation: "concert_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          kind: string;
          link: string | null;
          payload: Json;
          read_at: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          link?: string | null;
          payload?: Json;
          read_at?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          link?: string | null;
          payload?: Json;
          read_at?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"];
          age: number | null;
          availability: string[];
          country_code: string | null;
          created_at: string;
          founding_expires_at: string | null;
          founding_lifetime: boolean;
          founding_paid_at: string | null;
          founding_plan: string | null;
          founding_stripe_subscription_id: string | null;
          full_name: string;
          genres: string[];
          id: string;
          include_age_in_matching: boolean;
          location: string | null;
          open_to_meetups: boolean;
          paid_at: string | null;
          plan_preference: string | null;
          razorpay_order_id: string | null;
          razorpay_paid_at: string | null;
          razorpay_payment_amount: number | null;
          razorpay_payment_currency: string | null;
          razorpay_payment_id: string | null;
          razorpay_payment_status: string | null;
          signup_complete: boolean;
          stripe_customer_id: string | null;
          stripe_session_id: string | null;
          updated_at: string;
          whatsapp: string | null;
        };
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"];
          age?: number | null;
          availability?: string[];
          country_code?: string | null;
          created_at?: string;
          founding_expires_at?: string | null;
          founding_lifetime?: boolean;
          founding_paid_at?: string | null;
          founding_plan?: string | null;
          founding_stripe_subscription_id?: string | null;
          full_name?: string;
          genres?: string[];
          id: string;
          include_age_in_matching?: boolean;
          location?: string | null;
          open_to_meetups?: boolean;
          paid_at?: string | null;
          plan_preference?: string | null;
          razorpay_order_id?: string | null;
          razorpay_paid_at?: string | null;
          razorpay_payment_amount?: number | null;
          razorpay_payment_currency?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_payment_status?: string | null;
          signup_complete?: boolean;
          stripe_customer_id?: string | null;
          stripe_session_id?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"];
          age?: number | null;
          availability?: string[];
          country_code?: string | null;
          created_at?: string;
          founding_expires_at?: string | null;
          founding_lifetime?: boolean;
          founding_paid_at?: string | null;
          founding_plan?: string | null;
          founding_stripe_subscription_id?: string | null;
          full_name?: string;
          genres?: string[];
          id?: string;
          include_age_in_matching?: boolean;
          location?: string | null;
          open_to_meetups?: boolean;
          paid_at?: string | null;
          plan_preference?: string | null;
          razorpay_order_id?: string | null;
          razorpay_paid_at?: string | null;
          razorpay_payment_amount?: number | null;
          razorpay_payment_currency?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_payment_status?: string | null;
          signup_complete?: boolean;
          stripe_customer_id?: string | null;
          stripe_session_id?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          created_at: string;
          description: string;
          event_id: string | null;
          evidence_url: string | null;
          id: string;
          reported_user_id: string;
          reporter_id: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["report_status"];
        };
        Insert: {
          created_at?: string;
          description: string;
          event_id?: string | null;
          evidence_url?: string | null;
          id?: string;
          reported_user_id: string;
          reporter_id: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Update: {
          created_at?: string;
          description?: string;
          event_id?: string | null;
          evidence_url?: string | null;
          id?: string;
          reported_user_id?: string;
          reporter_id?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Relationships: [
          {
            foreignKeyName: "reports_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "concerts";
            referencedColumns: ["id"];
          },
        ];
      };
      solo_recommendations: {
        Row: {
          concert_id: string;
          created_at: string;
          id: string;
          sent_at: string;
          user_id: string;
        };
        Insert: {
          concert_id: string;
          created_at?: string;
          id?: string;
          sent_at?: string;
          user_id: string;
        };
        Update: {
          concert_id?: string;
          created_at?: string;
          id?: string;
          sent_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "solo_recommendations_concert_id_fkey";
            columns: ["concert_id"];
            isOneToOne: false;
            referencedRelation: "concerts";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null;
          created_at: string | null;
          current_period_end: string | null;
          current_period_start: string | null;
          environment: string;
          id: string;
          price_id: string;
          product_id: string;
          status: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          cancel_at_period_end?: boolean | null;
          created_at?: string | null;
          current_period_end?: string | null;
          current_period_start?: string | null;
          environment?: string;
          id?: string;
          price_id: string;
          product_id: string;
          status?: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean | null;
          created_at?: string | null;
          current_period_end?: string | null;
          current_period_start?: string | null;
          environment?: string;
          id?: string;
          price_id?: string;
          product_id?: string;
          status?: string;
          stripe_customer_id?: string;
          stripe_subscription_id?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_concerts: {
        Row: {
          artists: string[];
          concert_at: string | null;
          concert_name: string;
          created_at: string;
          duration_minutes: number | null;
          genres: string[];
          id: string;
          programme: string | null;
          source: string;
          updated_at: string;
          user_id: string;
          venue: string | null;
        };
        Insert: {
          artists?: string[];
          concert_at?: string | null;
          concert_name: string;
          created_at?: string;
          duration_minutes?: number | null;
          genres?: string[];
          id?: string;
          programme?: string | null;
          source: string;
          updated_at?: string;
          user_id: string;
          venue?: string | null;
        };
        Update: {
          artists?: string[];
          concert_at?: string | null;
          concert_name?: string;
          created_at?: string;
          duration_minutes?: number | null;
          genres?: string[];
          id?: string;
          programme?: string | null;
          source?: string;
          updated_at?: string;
          user_id?: string;
          venue?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_concert_intent_counts: {
        Args: never;
        Returns: {
          concert_slug: string;
          going_count: number;
        }[];
      };
      has_active_founding: { Args: { _user_id: string }; Returns: boolean };
    };
    Enums: {
      account_status: "active" | "suspended" | "banned";
      affinity_level: "boost" | "neutral" | "reduce" | "rare";
      app_role: "admin" | "user";
      group_chat_status: "forming" | "pending_payment" | "active" | "closed";
      report_status:
        | "pending"
        | "under_review"
        | "resolved_no_action"
        | "resolved_warning"
        | "resolved_suspended"
        | "resolved_banned";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["active", "suspended", "banned"],
      affinity_level: ["boost", "neutral", "reduce", "rare"],
      app_role: ["admin", "user"],
      group_chat_status: ["forming", "pending_payment", "active", "closed"],
      report_status: [
        "pending",
        "under_review",
        "resolved_no_action",
        "resolved_warning",
        "resolved_suspended",
        "resolved_banned",
      ],
    },
  },
} as const;
