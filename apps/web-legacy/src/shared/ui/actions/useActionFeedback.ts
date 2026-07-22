import { useEffect, useRef, useState } from 'react';
import {
  createActionFeedbackController,
  type ActionFeedbackPhase,
  type ActionFeedbackPolicyName,
  type ActionState
} from './actionFeedback';

export function useActionFeedback(
  actionState: ActionState,
  policy: ActionFeedbackPolicyName = 'standard'
) {
  const [phase, setPhase] = useState<ActionFeedbackPhase>('idle');
  const controllerRef = useRef<ReturnType<typeof createActionFeedbackController> | null>(null);

  useEffect(() => {
    const controller = createActionFeedbackController({ policy, onPhaseChange: setPhase });
    controllerRef.current = controller;
    controller.update(actionState);
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [policy]);

  useEffect(() => {
    controllerRef.current?.update(actionState);
  }, [actionState]);

  return phase;
}
