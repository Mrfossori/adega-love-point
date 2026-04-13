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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      finance_entries: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          entry_type: Database["public"]["Enums"]["finance_entry_type"]
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["finance_source_type"]
          status: Database["public"]["Enums"]["finance_entry_status"]
        }
        Insert: {
          amount: number
          created_at?: string
          due_date?: string | null
          entry_type: Database["public"]["Enums"]["finance_entry_type"]
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          source_id?: string | null
          source_type: Database["public"]["Enums"]["finance_source_type"]
          status?: Database["public"]["Enums"]["finance_entry_status"]
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          entry_type?: Database["public"]["Enums"]["finance_entry_type"]
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["finance_source_type"]
          status?: Database["public"]["Enums"]["finance_entry_status"]
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          direction: Database["public"]["Enums"]["movement_direction"]
          id: string
          note: string | null
          product_id: string
          quantity: number
          reason: Database["public"]["Enums"]["movement_reason"]
        }
        Insert: {
          created_at?: string
          direction: Database["public"]["Enums"]["movement_direction"]
          id?: string
          note?: string | null
          product_id: string
          quantity: number
          reason: Database["public"]["Enums"]["movement_reason"]
        }
        Update: {
          created_at?: string
          direction?: Database["public"]["Enums"]["movement_direction"]
          id?: string
          note?: string | null
          product_id?: string
          quantity?: number
          reason?: Database["public"]["Enums"]["movement_reason"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_components: {
        Row: {
          combo_product_id: string
          component_product_id: string
          component_qty: number
          id: string
        }
        Insert: {
          combo_product_id: string
          component_product_id: string
          component_qty: number
          id?: string
        }
        Update: {
          combo_product_id?: string
          component_product_id?: string
          component_qty?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_components_combo_product_id_fkey"
            columns: ["combo_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          cost_price: number
          created_at: string
          id: string
          is_active: boolean
          is_combo: boolean
          min_stock: number
          name: string
          sale_price: number
          track_stock: boolean
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_combo?: boolean
          min_stock?: number
          name: string
          sale_price?: number
          track_stock?: boolean
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_combo?: boolean
          min_stock?: number
          name?: string
          sale_price?: number
          track_stock?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      sales_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          product_name: string
          quantity: number
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          product_name: string
          quantity: number
          subtotal: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_sales_report"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          created_at: string
          id: string
          payment_method: string
          sale_type: string
          total: number
        }
        Insert: {
          created_at?: string
          id?: string
          payment_method?: string
          sale_type?: string
          total?: number
        }
        Update: {
          created_at?: string
          id?: string
          payment_method?: string
          sale_type?: string
          total?: number
        }
        Relationships: []
      }
      stock_purchase_items: {
        Row: {
          id: string
          line_total: number
          product_id: string
          quantity: number
          stock_purchase_id: string
          unit_cost: number
        }
        Insert: {
          id?: string
          line_total: number
          product_id: string
          quantity: number
          stock_purchase_id: string
          unit_cost: number
        }
        Update: {
          id?: string
          line_total?: number
          product_id?: string
          quantity?: number
          stock_purchase_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_purchase_items_stock_purchase_id_fkey"
            columns: ["stock_purchase_id"]
            isOneToOne: false
            referencedRelation: "stock_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_purchases: {
        Row: {
          created_at: string
          due_date: string | null
          expected_receipt_date: string | null
          id: string
          notes: string | null
          payment_method: string | null
          payment_recorded_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          purchase_date: string
          stock_received_at: string | null
          stock_status: Database["public"]["Enums"]["stock_purchase_status"]
          supplier_id: string | null
          total_amount: number
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          expected_receipt_date?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_recorded_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          purchase_date?: string
          stock_received_at?: string | null
          stock_status?: Database["public"]["Enums"]["stock_purchase_status"]
          supplier_id?: string | null
          total_amount?: number
        }
        Update: {
          created_at?: string
          due_date?: string | null
          expected_receipt_date?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_recorded_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          purchase_date?: string
          stock_received_at?: string | null
          stock_status?: Database["public"]["Enums"]["stock_purchase_status"]
          supplier_id?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_snapshot: {
        Row: {
          id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_snapshot_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          tax_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_sales_report: {
        Row: {
          created_at: string | null
          id: string | null
          payment_method: string | null
          sale_type: string | null
          total: number | null
          total_items: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      finance_entry_status: "pending" | "paid" | "cancelled"
      finance_entry_type: "income" | "expense"
      finance_source_type:
        | "stock_purchase"
        | "operational_expense"
        | "sale"
        | "manual"
      movement_direction: "IN" | "OUT"
      movement_reason: "purchase" | "sale" | "adjustment"
      payment_status: "unpaid" | "paid" | "cancelled"
      stock_purchase_status: "pending_receipt" | "received" | "cancelled"
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
  public: {
    Enums: {
      finance_entry_status: ["pending", "paid", "cancelled"],
      finance_entry_type: ["income", "expense"],
      finance_source_type: [
        "stock_purchase",
        "operational_expense",
        "sale",
        "manual",
      ],
      movement_direction: ["IN", "OUT"],
      movement_reason: ["purchase", "sale", "adjustment"],
      payment_status: ["unpaid", "paid", "cancelled"],
      stock_purchase_status: ["pending_receipt", "received", "cancelled"],
    },
  },
} as const
