import React, { useState, useEffect } from "react";
import { apiGet, apiSend, ApiError, getApiErrorMessage } from "@/api/client";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Trophy,
  Users,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Template {
  id: string;
  templateName: string;
  templateType: string;
  description: string;
  config: {
    type: string;
    playersPerMatch?: number;
    phases: Array<{
      name: string;
      type: string;
      rounds?: number;
      matches?: number;
    }>;
    tiers?: string[];
  };
}

interface ConfigWizardProps {
  tournamentCode?: string;
  onComplete?: () => void;
}

const STEPS = ["Chọn Format", "Cấu Hình", "Xác Nhận"];

export const ConfigWizard: React.FC<ConfigWizardProps> = ({
  tournamentCode,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const data = await apiGet<Template[]>(`/templates`);
        setTemplates(data.data!);
      } catch (err) {
        // Lỗi HTTP/envelope: bỏ qua như trước; lỗi khác vẫn báo lỗi tải.
        if (!(err instanceof ApiError)) setError("Failed to load templates");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, []);

  const handleApplyTemplate = async () => {
    if (!selectedTemplate || !tournamentCode) return;

    setIsApplying(true);
    setError(null);

    try {
      await apiSend<unknown>(
        "POST",
        `/tournaments/${tournamentCode}/apply-template`,
        { templateId: selectedTemplate.id },
      );

      onComplete?.();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to apply template"));
    } finally {
      setIsApplying(false);
    }
  };

  const getTemplateIcon = (type: string) => {
    switch (type) {
      case "individual":
        return <Users size={24} className="text-brand" />;
      default:
        return <Trophy size={24} className="text-warning" />;
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground mb-4">
              Chọn Format Giải Đấu
            </h3>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-4">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`
                      p-4 rounded-lg border-2 cursor-pointer transition-all
                      ${
                        selectedTemplate?.id === template.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-border bg-accent/50"
                      }
                    `}
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-accent rounded-lg">
                        {getTemplateIcon(template.config.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-foreground">
                            {template.templateName}
                          </h4>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {template.description}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {template.config.phases.map((phase, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-accent text-foreground text-xs rounded"
                            >
                              {phase.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      {selectedTemplate?.id === template.id && (
                        <Check size={20} className="text-brand" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground mb-4">
              Cấu Hình Giải Đấu
            </h3>
            {selectedTemplate && (
              <Card className="px-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">
                      {selectedTemplate.templateName}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedTemplate.description}
                    </p>
                  </div>

                  <div className="border-t border-border pt-4">
                    <h5 className="text-sm font-medium text-muted-foreground mb-3">
                      Các Phase
                    </h5>
                    <div className="space-y-2">
                      {selectedTemplate.config.phases.map((phase, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 bg-accent/50 rounded"
                        >
                          <span className="text-foreground text-sm">
                            {phase.name}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            {phase.rounds
                              ? `${phase.rounds} rounds`
                              : `${phase.matches} matches`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedTemplate.config.tiers && (
                    <div className="border-t border-border pt-4">
                      <h5 className="text-sm font-medium text-muted-foreground mb-3">
                        Tiers
                      </h5>
                      <div className="flex gap-2">
                        {selectedTemplate.config.tiers.map((tier) => (
                          <span
                            key={tier}
                            className="px-3 py-1 bg-primary/20 text-brand rounded font-medium"
                          >
                            Tier {tier}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </Card>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground mb-4">
              Xác Nhận
            </h3>
            {selectedTemplate && (
              <Card className="px-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-success/20 rounded-lg">
                      <Check size={20} className="text-success" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground">
                        Sẵn sàng áp dụng
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Template "{selectedTemplate.templateName}" sẽ được áp
                        dụng cho giải đấu này.
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-border pt-4">
                    <p className="text-sm text-muted-foreground">
                      Sau khi áp dụng, hệ thống sẽ tự động tạo các phase, round
                      và match dựa trên template.
                    </p>
                  </div>

                  {error && (
                    <div className="p-3 bg-destructive/20 border border-destructive rounded text-destructive text-sm">
                      {error}
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {}
      <div className="flex items-center justify-center mb-8">
        {STEPS.map((step, index) => (
          <React.Fragment key={step}>
            <div className="flex items-center gap-2">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                  ${
                    index < currentStep
                      ? "bg-success text-success-foreground"
                      : index === currentStep
                        ? "bg-primary text-primary-foreground"
                        : "bg-accent text-muted-foreground"
                  }
                `}
              >
                {index < currentStep ? (
                  <Check size={16} />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`text-sm hidden sm:inline ${
                  index <= currentStep ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`w-12 sm:w-20 h-0.5 mx-2 ${
                  index < currentStep ? "bg-success" : "bg-accent"
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {}
      <div className="mb-8">{renderStepContent()}</div>

      {}
      <div className="flex justify-between">
        <Button
          variant="secondary"
          onClick={() => setCurrentStep((prev) => prev - 1)}
          disabled={currentStep === 0}
        >
          <ArrowLeft size={16} />
          Quay lại
        </Button>

        {currentStep < STEPS.length - 1 ? (
          <Button
            onClick={() => setCurrentStep((prev) => prev + 1)}
            disabled={!selectedTemplate}
          >
            Tiếp theo
            <ArrowRight size={16} />
          </Button>
        ) : (
          <Button
            onClick={handleApplyTemplate}
            disabled={isApplying}
            className="bg-success text-success-foreground hover:bg-success/90"
          >
            <Check size={16} />
            Áp dụng Template
          </Button>
        )}
      </div>
    </div>
  );
};
