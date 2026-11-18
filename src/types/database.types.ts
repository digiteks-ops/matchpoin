export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type PreferredHand = 'right' | 'left';
export type BackhandStyle = 'one_handed' | 'two_handed';
export type PlayFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'occasional';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
export type ProfileVisibility = 'public' | 'friends_only' | 'private';

export interface Database {
  public: {
    Tables: {
      cities: {
        Row: {
          id: string;
          name: string;
          province: string;
          latitude: number | null;
          longitude: number | null;
          is_active: boolean;
          sort_order: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          province: string;
          latitude?: number | null;
          longitude?: number | null;
          is_active?: boolean;
          sort_order?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          province?: string;
          latitude?: number | null;
          longitude?: number | null;
          is_active?: boolean;
          sort_order?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          phone: string | null;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          date_of_birth: string | null;
          gender: Gender | null;
          city_id: string | null;
          timezone: string;
          locale: string;
          is_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          phone?: string | null;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          date_of_birth?: string | null;
          gender?: Gender | null;
          city_id?: string | null;
          timezone?: string;
          locale?: string;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          phone?: string | null;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          date_of_birth?: string | null;
          gender?: Gender | null;
          city_id?: string | null;
          timezone?: string;
          locale?: string;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      player_profiles: {
        Row: {
          id: string;
          user_id: string;
          display_name: string | null;
          bio: string | null;
          playing_since: string | null;
          preferred_hand: PreferredHand | null;
          backhand: BackhandStyle | null;
          preferred_court_id: string | null;
          play_frequency: PlayFrequency | null;
          preferred_categories: string[] | null;
          preferred_times: string[] | null;
          self_assessed_level: SkillLevel | null;
          ntrp_rating: number | null;
          itf_wtn: number | null;
          usta_rating: number | null;
          is_profile_public: boolean;
          profile_visibility: ProfileVisibility;
          show_rating: boolean;
          show_history: boolean;
          show_online_status: boolean;
          allow_invites: boolean;
          completion_score: number;
          is_verified_player: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_name?: string | null;
          bio?: string | null;
          playing_since?: string | null;
          preferred_hand?: PreferredHand | null;
          backhand?: BackhandStyle | null;
          preferred_court_id?: string | null;
          play_frequency?: PlayFrequency | null;
          preferred_categories?: string[] | null;
          preferred_times?: string[] | null;
          self_assessed_level?: SkillLevel | null;
          ntrp_rating?: number | null;
          itf_wtn?: number | null;
          usta_rating?: number | null;
          is_profile_public?: boolean;
          profile_visibility?: ProfileVisibility;
          show_rating?: boolean;
          show_history?: boolean;
          show_online_status?: boolean;
          allow_invites?: boolean;
          completion_score?: number;
          is_verified_player?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          display_name?: string | null;
          bio?: string | null;
          playing_since?: string | null;
          preferred_hand?: PreferredHand | null;
          backhand?: BackhandStyle | null;
          preferred_court_id?: string | null;
          play_frequency?: PlayFrequency | null;
          preferred_categories?: string[] | null;
          preferred_times?: string[] | null;
          self_assessed_level?: SkillLevel | null;
          ntrp_rating?: number | null;
          itf_wtn?: number | null;
          usta_rating?: number | null;
          is_profile_public?: boolean;
          profile_visibility?: ProfileVisibility;
          show_rating?: boolean;
          show_history?: boolean;
          show_online_status?: boolean;
          allow_invites?: boolean;
          completion_score?: number;
          is_verified_player?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      player_ratings: {
        Row: {
          id: string;
          user_id: string;
          current_rating: number;
          peak_rating: number;
          matches_played: number;
          wins: number;
          losses: number;
          draws: number;
          win_streak: number;
          best_win_streak: number;
          current_streak_type: string;
          last_match_at: string | null;
          last_rating_change_at: string | null;
          rating_algorithm_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          current_rating?: number;
          peak_rating?: number;
          matches_played?: number;
          wins?: number;
          losses?: number;
          draws?: number;
          win_streak?: number;
          best_win_streak?: number;
          current_streak_type?: string;
          last_match_at?: string | null;
          last_rating_change_at?: string | null;
          rating_algorithm_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          current_rating?: number;
          peak_rating?: number;
          matches_played?: number;
          wins?: number;
          losses?: number;
          draws?: number;
          win_streak?: number;
          best_win_streak?: number;
          current_streak_type?: string;
          last_match_at?: string | null;
          last_rating_change_at?: string | null;
          rating_algorithm_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tennis_courts: {
        Row: {
          id: string;
          name: string;
          city_id: string;
          address: string;
          court_type: string;
          number_of_courts: number;
          environment: string;
          status: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          city_id: string;
          address: string;
          court_type?: string;
          number_of_courts?: number;
          environment?: string;
          status?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          city_id?: string;
          address?: string;
          court_type?: string;
          number_of_courts?: number;
          environment?: string;
          status?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
  };
}

export type DbUser = Database['public']['Tables']['users']['Row'];
export type PlayerProfile = Database['public']['Tables']['player_profiles']['Row'];
export type PlayerRating = Database['public']['Tables']['player_ratings']['Row'];
export type City = Database['public']['Tables']['cities']['Row'];
export type TennisCourt = Database['public']['Tables']['tennis_courts']['Row'];
export type Profile = DbUser; // Backwards compatibility alias

/** Combined Full Player View Model */
export interface FullPlayerProfile {
  userId: string;
  email: string | null;
  fullName: string;
  displayName: string;
  avatarUrl: string | null;
  gender: Gender | null;
  cityId: string | null;
  cityName: string;
  province: string | null;
  bio: string | null;
  preferredHand: PreferredHand;
  backhand: BackhandStyle;
  playFrequency: PlayFrequency;
  selfAssessedLevel: SkillLevel;
  playingSince: string | null;
  preferredCategories: string[];
  preferredTimes: string[];
  currentRating: number;
  peakRating: number;
  isProvisional: boolean;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  completionScore: number;
  isProfilePublic: boolean;
  allowInvites: boolean;
  showRating?: boolean;
}
