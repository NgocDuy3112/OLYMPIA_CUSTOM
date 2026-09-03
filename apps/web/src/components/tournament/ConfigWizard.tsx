import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Trophy,
  Users,
  Target,
  Loader2,
} from "lucide-react";
import { Card, Button } from "../shared/ui";

interface Template {
  id: string;
  templateName: string;
  templateType: string;
  description: string;
  config: {
    type: string;
    playersPerMatch?: number;
    playersPerTeam?: number;
    teamsPerMatch?: number;
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
  const navigate = useNavigate();
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
        const response = await fetch(`${API_BASE_URL}/templates`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          if (data.status === "success") {
            setTemplates(data.data);
          }
        }
      } catch (err) {
        setError("Failed to load templates");
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
      const response = await fetch(
        `${API_BASE_URL}/tournaments/${tournamentCode}/apply-template`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ templateId: selectedTemplate.id }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to apply template");
      }

      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply template");
    } finally {
      setIsApplying(false);
    }
  };

  const getTemplateIcon = (type: string) => {
    switch (type) {
      case "individual":
        return <Users size={24} className="text-blue-400" />;
      case "team":
        return <Users size={24} className="text-purple-400" />;
      default:
        return <Trophy size={24} className="text-yellow-400" />;
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">
              Chọn Format Giải Đấu
            </h3>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin text-gray-400" />
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
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-white/20 hover:border-white/40 bg-white/5"
                      }
                    `}
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-white/10 rounded-lg">
                        {getTemplateIcon(template.config.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-white">
                            {template.templateName}
                          </h4>
                          {template.config.type === "team" && (
                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded">
                              2v2
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400">
                          {template.description}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {template.config.phases.map((phase, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-white/10 text-gray-300 text-xs rounded"
                            >
                              {phase.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      {selectedTemplate?.id === template.id && (
                        <Check size={20} className="text-blue-400" />
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
            <h3 className="text-lg font-bold text-white mb-4">
              Cấu Hình Giải Đấu
            </h3>
            {selectedTemplate && (
              <Card>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      {selectedTemplate.templateName}
                    </h4>
                    <p className="text-sm text-gray-400">
                      {selectedTemplate.description}
                    </p>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <h5 className="text-sm font-medium text-gray-400 mb-3">
                      Các Phase
                    </h5>
                    <div className="space-y-2">
                      {selectedTemplate.config.phases.map((phase, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 bg-white/5 rounded"
                        >
                          <span className="text-white text-sm">
                            {phase.name}
                          </span>
                          <span className="text-gray-400 text-sm">
                            {phase.rounds
                              ? `${phase.rounds} rounds`
                              : `${phase.matches} matches`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedTemplate.config.tiers && (
                    <div className="border-t border-white/10 pt-4">
                      <h5 className="text-sm font-medium text-gray-400 mb-3">
                        Tiers
                      </h5>
                      <div className="flex gap-2">
                        {selectedTemplate.config.tiers.map((tier) => (
                          <span
                            key={tier}
                            className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded font-medium"
                          >
                            Tier {tier}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedTemplate.config.type === "team" && (
                    <div className="border-t border-white/10 pt-4">
                      <h5 className="text-sm font-medium text-gray-400 mb-3">
                        Team Config
                      </h5>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-white/5 rounded">
                          <div className="text-2xl font-bold text-white">
                            {selectedTemplate.config.playersPerTeam}
                          </div>
                          <div className="text-sm text-gray-400">
                            Players per team
                          </div>
                        </div>
                        <div className="p-3 bg-white/5 rounded">
                          <div className="text-2xl font-bold text-white">
                            {selectedTemplate.config.teamsPerMatch}
                          </div>
                          <div className="text-sm text-gray-400">
                            Teams per match
                          </div>
                        </div>
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
            <h3 className="text-lg font-bold text-white mb-4">
              Xác Nhận
            </h3>
            {selectedTemplate && (
              <Card>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <Check size={20} className="text-green-400" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">
                        Sẵn sàng áp dụng
                      </h4>
                      <p className="text-sm text-gray-400">
                        Template "{selectedTemplate.templateName}" sẽ được áp
                        dụng cho giải đấu này.
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <p className="text-sm text-gray-400">
                      Sau khi áp dụng, hệ thống sẽ tự động tạo các phase, round
                      và match dựa trên template.
                    </p>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-500/20 border border-red-500 rounded text-red-400 text-sm">
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
      {/* Steps indicator */}
      <div className="flex items-center justify-center mb-8">
        {STEPS.map((step, index) => (
          <React.Fragment key={step}>
            <div className="flex items-center gap-2">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                  ${
                    index < currentStep
                      ? "bg-green-500 text-white"
                      : index === currentStep
                        ? "bg-blue-500 text-white"
                        : "bg-white/10 text-gray-400"
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
                  index <= currentStep ? "text-white" : "text-gray-400"
                }`}
              >
                {step}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`w-12 sm:w-20 h-0.5 mx-2 ${
                  index < currentStep ? "bg-green-500" : "bg-white/10"
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      <div className="mb-8">{renderStepContent()}</div>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button
          variant="secondary"
          onClick={() => setCurrentStep((prev) => prev - 1)}
          disabled={currentStep === 0}
          leftIcon={<ArrowLeft size={16} />}
        >
          Quay lại
        </Button>

        {currentStep < STEPS.length - 1 ? (
          <Button
            onClick={() => setCurrentStep((prev) => prev + 1)}
            disabled={!selectedTemplate}
            rightIcon={<ArrowRight size={16} />}
          >
            Tiếp theo
          </Button>
        ) : (
          <Button
            onClick={handleApplyTemplate}
            isLoading={isApplying}
            variant="success"
            leftIcon={<Check size={16} />}
          >
            Áp dụng Template
          </Button>
        )}
      </div>
    </div>
  );
};
